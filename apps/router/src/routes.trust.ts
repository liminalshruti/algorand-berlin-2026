import { Hono } from 'hono';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import type { Ctx, FeedbackIntent, OnChainPayment, PaymentChallenge, RouteOption } from './contract.js';
import type { ValidationResult } from './validation.js';
import { paymentRequirementForExecution } from './agents.js';
import { maybeWriteReputation, maybeWriteValidation } from './onchain.js';

const MICROALGO = 1_000_000;
const EPSILON = 1e-9;
const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_FEEDBACK_TTL_MS = 10 * 60 * 1000;
const VALIDATION_SCHEMA = 'trust-router.validation.v1';
const FEEDBACK_SCHEMA = 'trust-router.feedback.v1';

type WritableRepState = Ctx['repState'] & {
  writeBack?: (agent_id: string, verdict: ValidationResult) => {
    score: number | null;
    reads_logged: number;
    corrections_logged: number;
    by_tag: Record<string, number>;
  };
};

type ChallengeBody = {
  route_id?: string;
  option_id?: string;
};

type PaymentProofBody = {
  challenge_id?: string;
  txid?: string;
  payer?: string;
};

type FeedbackIntentBody = {
  challenge_id?: string;
  payment_txid?: string;
  payer?: string;
  response?: number;
};

type FeedbackBody = {
  feedback_intent_id?: string;
  auth_txid?: string;
};

function ensureTrustStores(ctx: Ctx): {
  challenges: Map<string, PaymentChallenge>;
  feedbackIntents: Map<string, FeedbackIntent>;
  usedFeedback: Set<string>;
} {
  ctx.challengeStore ??= new Map();
  ctx.feedbackIntentStore ??= new Map();
  ctx.usedFeedbackPaymentTxids ??= new Set();
  return {
    challenges: ctx.challengeStore,
    feedbackIntents: ctx.feedbackIntentStore,
    usedFeedback: ctx.usedFeedbackPaymentTxids,
  };
}

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function errorStatus(status?: number): 400 | 500 | 501 {
  if (status === 501) return 501;
  if (status && status >= 400 && status < 500) return 400;
  return 500;
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256Bytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(sha256Hex(value), 'hex'));
}

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function sameAmount(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON;
}

function nowIso(): string {
  return new Date().toISOString();
}

function inFuture(iso: string): boolean {
  const time = Date.parse(iso);
  return Number.isFinite(time) && time > Date.now();
}

function ttlFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function paymentNote(challenge_id: string, nonce: string): string {
  return stableJson({
    schema: 'trust-router.challenge.v1',
    challenge_id,
    nonce,
  });
}

function noteBindsChallenge(note: string | undefined, challenge: PaymentChallenge): boolean {
  if (!note) return false;
  try {
    const parsed = JSON.parse(note) as { schema?: string; challenge_id?: string; nonce?: string };
    return parsed.schema === 'trust-router.challenge.v1'
      && parsed.challenge_id === challenge.challenge_id
      && parsed.nonce === challenge.nonce;
  } catch {
    return false;
  }
}

function feedbackNote(intent: Omit<FeedbackIntent, 'note' | 'note_hash'>): string {
  return stableJson({
    schema: 'trust-router.feedback-auth.v1',
    feedback_intent_id: intent.feedback_intent_id,
    challenge_id: intent.challenge_id,
    payment_txid: intent.payment_txid,
    payer: intent.payer,
    agent_id: intent.agent_id,
    response: intent.response,
    nonce: intent.nonce,
  });
}

function nonceToUint64(nonce: string): bigint {
  const bytes = Buffer.from(sha256Hex(nonce).slice(0, 16), 'hex');
  let out = 0n;
  for (const byte of bytes) out = (out << 8n) + BigInt(byte);
  return out;
}

function findRouteOption(ctx: Ctx, route_id: string, option_id: string): RouteOption {
  const route = ctx.routeStore.get(route_id);
  if (!route) fail('unknown route_id');
  const option = route.options.find((candidate) => candidate.option_id === option_id);
  if (!option) fail('unknown option_id');
  return option;
}

function paymentProofAlreadyUsed(ctx: Ctx, txid: string, currentChallengeId: string): boolean {
  const challenges = ensureTrustStores(ctx).challenges;
  for (const challenge of challenges.values()) {
    if (challenge.challenge_id !== currentChallengeId && challenge.payment_txid === txid) return true;
  }
  return false;
}

async function recordPolicyEvidence(
  ctx: Ctx,
  challenge: PaymentChallenge,
): Promise<{ validation_id: string; validation_txid: string | null; ledger_txid: string | null }> {
  if (challenge.validation_id) {
    return {
      validation_id: challenge.validation_id,
      validation_txid: challenge.validation_txid ?? null,
      ledger_txid: challenge.ledger_txid ?? null,
    };
  }

  const validation_id = randomUUID();
  const response = challenge.quote_drift ? 0 : 100;
  const tag = challenge.quote_drift ? 'quote_drift' : 'fair';
  const evidence = {
    validation_id,
    challenge_id: challenge.challenge_id,
    agent_id: challenge.agent_id,
    quote_id: challenge.quote_id,
    quote_amount: challenge.quote_amount,
    challenge_amount: challenge.amount,
    response,
    tag,
    payment_txid: challenge.payment_txid ?? '',
  };
  const evidenceJson = stableJson(evidence);
  const requestHash = sha256Bytes(evidenceJson);
  const responseHash = sha256Bytes(stableJson({ validation_id, response, tag }));

  const onchain = await maybeWriteValidation(ctx, challenge.agent_id, requestHash, responseHash, response, tag);
  let validation_txid = onchain?.responseTxid ?? onchain?.txid ?? null;
  let ledger_txid: string | null = null;

  if (!validation_txid) {
    const hash = sha256Hex(evidenceJson);
    try {
      const anchor = await ctx.deps.anchorNote(challenge.challenge_id, VALIDATION_SCHEMA, hash);
      ledger_txid = anchor.txid;
      ctx.ledger.push({
        txid: anchor.txid,
        schema: VALIDATION_SCHEMA,
        ref_id: challenge.challenge_id,
        hash,
        round: anchor.round,
        network: ctx.net,
      });
    } catch {
      ledger_txid = null;
    }
  }

  challenge.validation_id = validation_id;
  if (validation_txid) challenge.validation_txid = validation_txid;
  if (ledger_txid) challenge.ledger_txid = ledger_txid;
  return { validation_id, validation_txid, ledger_txid };
}

async function verifyPaymentTransaction(
  ctx: Ctx,
  challenge: PaymentChallenge,
  txid: string,
  payer: string,
): Promise<OnChainPayment> {
  if (!inFuture(challenge.expires_at)) fail('challenge expired');
  if (challenge.payment_txid && challenge.payment_txid !== txid) fail('challenge already has a different proof');
  if (paymentProofAlreadyUsed(ctx, txid, challenge.challenge_id)) fail('payment txid already used for another challenge');
  const lookup = ctx.deps.lookupPayment;
  if (!lookup) fail('payment lookup unavailable', 501);
  const payment = await lookup(txid);
  if (!payment) fail('unknown payment txid');
  if (payment.round === undefined) fail('payment txid is not confirmed');
  if (payment.sender !== payer) fail('payer does not match payment sender');
  if (payment.receiver !== challenge.pay_to) fail('payment receiver does not match challenge');
  if (!sameAmount(payment.amount, challenge.amount)) fail('payment amount does not match challenge');
  if (payment.asset !== challenge.asset) fail('payment asset does not match challenge');
  if (payment.network !== challenge.network) fail('payment network does not match challenge');
  if (!noteBindsChallenge(payment.note, challenge)) fail('payment note does not bind challenge');
  return payment;
}

async function acceptPaymentProof(
  ctx: Ctx,
  challenge: PaymentChallenge,
  txid: string,
  payer: string,
): Promise<{
  payment: OnChainPayment;
  validation_id: string;
  validation_txid: string | null;
  ledger_txid: string | null;
  new_reputation: number | null;
}> {
  if (challenge.payment_txid) {
    if (challenge.payment_txid !== txid || challenge.payer !== payer) fail('challenge proof mismatch');
    const lookup = ctx.deps.lookupPayment;
    const payment = lookup ? await lookup(txid) : null;
    return {
      payment: payment ?? {
        txid,
        sender: payer,
        receiver: challenge.pay_to,
        amount: challenge.amount,
        asset: challenge.asset,
        network: challenge.network,
        note: challenge.payment_note,
      },
      validation_id: challenge.validation_id ?? '',
      validation_txid: challenge.validation_txid ?? null,
      ledger_txid: challenge.ledger_txid ?? null,
      new_reputation: ctx.repState.getReputation(challenge.agent_id)?.score ?? null,
    };
  }

  const payment = await verifyPaymentTransaction(ctx, challenge, txid, payer);
  challenge.payment_txid = txid;
  challenge.payer = payer;
  challenge.proof_accepted_at = nowIso();

  const policy = await recordPolicyEvidence(ctx, challenge);
  let new_reputation: number | null = null;
  if (challenge.quote_drift) {
    const writer = (ctx.repState as WritableRepState).writeBack;
    const updated = writer?.(challenge.agent_id, {
      price_match: false,
      output_pass: null,
      response: 0,
      tag: 'quote_drift',
    });
    new_reputation = updated?.score ?? null;
  }

  return { payment, ...policy, new_reputation };
}

async function verifyFeedbackAuth(
  ctx: Ctx,
  intent: FeedbackIntent,
  auth_txid: string,
): Promise<OnChainPayment> {
  if (!inFuture(intent.expires_at)) fail('feedback intent expired');
  if (intent.accepted_at) fail('feedback intent already accepted');
  const lookup = ctx.deps.lookupPayment;
  if (!lookup) fail('payment lookup unavailable', 501);
  const auth = await lookup(auth_txid);
  if (!auth) fail('unknown auth txid');
  if (auth.round === undefined) fail('auth txid is not confirmed');
  if (auth.sender !== intent.payer || auth.receiver !== intent.payer) fail('auth tx must be payer self-payment');
  if (!sameAmount(auth.amount, 0)) fail('auth tx must be 0 ALGO');
  if (auth.asset !== 'ALGO') fail('auth tx must use ALGO');
  if (auth.network !== ctx.net) fail('auth tx network mismatch');
  if (!auth.note || sha256Hex(auth.note) !== intent.note_hash) fail('auth tx note does not match feedback intent');
  return auth;
}

async function recordFeedback(
  ctx: Ctx,
  intent: FeedbackIntent,
): Promise<{ reputation_txid: string | null; ledger_txid: string | null }> {
  const reputation = await maybeWriteReputation(
    ctx,
    intent.agent_id,
    intent.response,
    intent.payment_txid,
    intent.payer,
    nonceToUint64(intent.nonce),
    'user_feedback',
  );
  if (reputation?.txid) return { reputation_txid: reputation.txid, ledger_txid: null };

  const hash = sha256Hex(stableJson({
    feedback_intent_id: intent.feedback_intent_id,
    challenge_id: intent.challenge_id,
    payment_txid: intent.payment_txid,
    payer: intent.payer,
    agent_id: intent.agent_id,
    response: intent.response,
    note_hash: intent.note_hash,
  }));
  try {
    const anchor = await ctx.deps.anchorNote(intent.feedback_intent_id, FEEDBACK_SCHEMA, hash);
    ctx.ledger.push({
      txid: anchor.txid,
      schema: FEEDBACK_SCHEMA,
      ref_id: intent.feedback_intent_id,
      hash,
      round: anchor.round,
      network: ctx.net,
    });
    return { reputation_txid: null, ledger_txid: anchor.txid };
  } catch {
    return { reputation_txid: null, ledger_txid: null };
  }
}

async function maybePayFeedbackRebate(
  ctx: Ctx,
  intent: FeedbackIntent,
  feedback_id: string,
): Promise<{ rebate_txid: string | null; rebate_error: string | null }> {
  if (process.env.FEEDBACK_REBATE_ENABLED !== 'true') {
    return { rebate_txid: null, rebate_error: null };
  }
  const amount = Number(process.env.FEEDBACK_REBATE_ALGO ?? '0.001');
  if (!Number.isFinite(amount) || amount <= 0) {
    return { rebate_txid: null, rebate_error: 'invalid FEEDBACK_REBATE_ALGO' };
  }
  try {
    const tx = await ctx.deps.settle(intent.payer, amount, {
      schema: 'trust-router.feedback-rebate.v1',
      feedback_id,
      payment_txid: intent.payment_txid,
      agent_id: intent.agent_id,
    });
    return { rebate_txid: tx.txid, rebate_error: null };
  } catch (error) {
    return {
      rebate_txid: null,
      rebate_error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createFeedbackIntent(
  challenge: PaymentChallenge,
  payment_txid: string,
  payer: string,
  response: number,
): FeedbackIntent {
  const base = {
    feedback_intent_id: randomUUID(),
    challenge_id: challenge.challenge_id,
    payment_txid,
    payer,
    agent_id: challenge.agent_id,
    quote_id: challenge.quote_id,
    response,
    nonce: randomUUID(),
    created_at: nowIso(),
    expires_at: ttlFromNow(DEFAULT_FEEDBACK_TTL_MS),
  };
  const note = feedbackNote(base);
  return {
    ...base,
    note,
    note_hash: sha256Hex(note),
  };
}

export function makeTrustRoutes(ctx: Ctx): Hono {
  const app = new Hono();

  app.post('/api/challenge', async (c) => {
    try {
      const body = await c.req.json<ChallengeBody>().catch((): ChallengeBody => ({}));
      const route_id = body.route_id?.trim();
      const option_id = body.option_id?.trim();
      if (!route_id) fail('route_id is required');
      if (!option_id) fail('option_id is required');

      const option = findRouteOption(ctx, route_id, option_id);
      const quote = ctx.activeQuotes.get(option.quote_id);
      if (!quote || quote.agent_id !== option.agent_id) fail('unknown active quote');
      if (!inFuture(quote.expires_at)) fail('active quote expired');

      const requirement = await paymentRequirementForExecution(ctx, option);
      const challenge_id = randomUUID();
      const nonce = requirement.nonce ?? randomUUID();
      const challenge: PaymentChallenge = {
        challenge_id,
        route_id,
        option_id,
        agent_id: option.agent_id,
        service_id: option.service_id,
        quote_id: option.quote_id,
        nonce,
        resource: requirement.resource ?? option.service_id,
        amount: requirement.amount,
        asset: requirement.asset,
        pay_to: requirement.pay_to,
        network: requirement.network ?? ctx.net,
        quote_amount: quote.amount,
        quote_pay_to: quote.pay_to,
        quote_expires_at: quote.expires_at,
        payment_note: paymentNote(challenge_id, nonce),
        quote_drift: !sameAmount(requirement.amount, quote.amount),
        observed_at: nowIso(),
        expires_at: requirement.expires_at ?? ttlFromNow(DEFAULT_CHALLENGE_TTL_MS),
      };

      ensureTrustStores(ctx).challenges.set(challenge_id, challenge);
      return c.json({
        challenge_id,
        agent_id: challenge.agent_id,
        service_id: challenge.service_id,
        quote_id: challenge.quote_id,
        amount: challenge.amount,
        asset: challenge.asset,
        pay_to: challenge.pay_to,
        network: challenge.network,
        nonce: challenge.nonce,
        resource: challenge.resource,
        expires_at: challenge.expires_at,
        payment_note: challenge.payment_note,
        quote: {
          amount: challenge.quote_amount,
          asset: quote.asset,
          pay_to: challenge.quote_pay_to,
          expires_at: challenge.quote_expires_at,
        },
        quote_drift: challenge.quote_drift,
      });
    } catch (error) {
      const err = error as Error & { status?: number };
      return c.json({ error: err.message }, errorStatus(err.status));
    }
  });

  app.post('/api/payment-proof', async (c) => {
    try {
      const body = await c.req.json<PaymentProofBody>().catch((): PaymentProofBody => ({}));
      const challenge_id = body.challenge_id?.trim();
      const txid = body.txid?.trim();
      const payer = body.payer?.trim();
      if (!challenge_id) fail('challenge_id is required');
      if (!txid) fail('txid is required');
      if (!payer) fail('payer is required');

      const challenge = ensureTrustStores(ctx).challenges.get(challenge_id);
      if (!challenge) fail('unknown challenge_id');
      const accepted = await acceptPaymentProof(ctx, challenge, txid, payer);
      return c.json({
        accepted: true,
        challenge_id,
        payment_txid: accepted.payment.txid,
        agent_id: challenge.agent_id,
        policy_result: challenge.quote_drift ? 'quote_drift' : 'fair',
        quote_drift: challenge.quote_drift,
        validation_id: accepted.validation_id,
        validation_txid: accepted.validation_txid,
        ledger_txid: accepted.ledger_txid,
        new_reputation: accepted.new_reputation,
      });
    } catch (error) {
      const err = error as Error & { status?: number };
      return c.json({ error: err.message }, errorStatus(err.status));
    }
  });

  app.post('/api/feedback/intent', async (c) => {
    try {
      const body = await c.req.json<FeedbackIntentBody>().catch((): FeedbackIntentBody => ({}));
      const challenge_id = body.challenge_id?.trim();
      const payment_txid = body.payment_txid?.trim();
      const payer = body.payer?.trim();
      const response = Number(body.response);
      if (!challenge_id) fail('challenge_id is required');
      if (!payment_txid) fail('payment_txid is required');
      if (!payer) fail('payer is required');
      if (!Number.isFinite(response) || response < 0 || response > 100) fail('response must be 0..100');

      const stores = ensureTrustStores(ctx);
      if (stores.usedFeedback.has(payment_txid)) fail('payment txid already used for feedback');
      const challenge = stores.challenges.get(challenge_id);
      if (!challenge) fail('unknown challenge_id');
      await acceptPaymentProof(ctx, challenge, payment_txid, payer);

      const intent = createFeedbackIntent(challenge, payment_txid, payer, Math.trunc(response));
      stores.feedbackIntents.set(intent.feedback_intent_id, intent);
      return c.json({
        feedback_intent_id: intent.feedback_intent_id,
        proof_id: payment_txid,
        note: intent.note,
        note_hash: intent.note_hash,
        expires_at: intent.expires_at,
      });
    } catch (error) {
      const err = error as Error & { status?: number };
      return c.json({ error: err.message }, errorStatus(err.status));
    }
  });

  app.post('/api/feedback', async (c) => {
    try {
      const body = await c.req.json<FeedbackBody>().catch((): FeedbackBody => ({}));
      const feedback_intent_id = body.feedback_intent_id?.trim();
      const auth_txid = body.auth_txid?.trim();
      if (!feedback_intent_id) fail('feedback_intent_id is required');
      if (!auth_txid) fail('auth_txid is required');

      const stores = ensureTrustStores(ctx);
      const intent = stores.feedbackIntents.get(feedback_intent_id);
      if (!intent) fail('unknown feedback_intent_id');
      if (stores.usedFeedback.has(intent.payment_txid)) fail('payment txid already used for feedback');
      await verifyFeedbackAuth(ctx, intent, auth_txid);

      stores.usedFeedback.add(intent.payment_txid);
      intent.accepted_at = nowIso();
      const writer = (ctx.repState as WritableRepState).writeBack;
      const newRep = writer?.(intent.agent_id, {
        price_match: true,
        output_pass: null,
        response: intent.response,
        tag: 'user_feedback',
      });
      const feedback_id = randomUUID();
      const registry = await recordFeedback(ctx, intent);
      const rebate = await maybePayFeedbackRebate(ctx, intent, feedback_id);

      return c.json({
        accepted: true,
        feedback_id,
        proof_id: intent.payment_txid,
        agent_id: intent.agent_id,
        response: intent.response,
        new_reputation: newRep?.score ?? null,
        reputation_txid: registry.reputation_txid,
        ledger_txid: registry.ledger_txid,
        rebate_txid: rebate.rebate_txid,
        rebate_error: rebate.rebate_error,
      });
    } catch (error) {
      const err = error as Error & { status?: number };
      return c.json({ error: err.message }, errorStatus(err.status));
    }
  });

  return app;
}
