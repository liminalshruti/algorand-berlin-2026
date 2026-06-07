import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActiveQuote, Agent, Ctx, OnChainPayment, RouteOption } from './contract.js';
import { createRepState } from './reputation-state.js';
import { makeAgentRoutes } from './routes.agents.js';
import { makeTrustRoutes } from './routes.trust.js';

const SERVICE_ID = 'diligence.report';
const PAYER = 'PAYERWALLET';

const honest: Agent = {
  id: 'agent-honest',
  name: 'Honest Agent',
  agent_uri: 'https://agents.local/honest',
  agent_wallet: 'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY',
};

const cheat: Agent = {
  id: 'agent-cheat',
  name: 'Cheat Agent',
  agent_uri: 'https://agents.local/cheat',
  agent_wallet: '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ',
};

function future(ms = 5 * 60 * 1000): string {
  return new Date(Date.now() + ms).toISOString();
}

function past(): string {
  return new Date(Date.now() - 60 * 1000).toISOString();
}

function quote(agent: Agent, quote_id: string, amount: number): ActiveQuote {
  return {
    quote_id,
    agent_id: agent.id,
    service_id: SERVICE_ID,
    amount,
    asset: 'ALGO',
    pay_to: agent.agent_wallet,
    observed_at: new Date().toISOString(),
    expires_at: future(),
  };
}

function option(agent: Agent, quote_id: string, price: number, index: number): RouteOption {
  return {
    option_id: `${quote_id}:opt-${index}`,
    agent_id: agent.id,
    service_id: SERVICE_ID,
    quote_id,
    name: agent.name,
    price,
    asset: 'ALGO',
    pay_to: agent.agent_wallet,
    reputation: 88,
    trust_score: 80,
  };
}

function mockCtx(payments = new Map<string, OnChainPayment>()): Ctx {
  const repState = createRepState();
  const qHonest = quote(honest, 'quote-honest', 0.1);
  const qCheat = quote(cheat, 'quote-cheat', 0.04);
  let anchorSeq = 0;
  let settleSeq = 0;
  return {
    net: 'testnet',
    store: null,
    session: {
      payer: { addr: 'ROUTERPAYER', sk: new Uint8Array(64) },
      facilitator: { addr: 'FAC', sk: new Uint8Array(64) },
      funded: { addr: 'ROUTERPAYER', sk: new Uint8Array(64) },
    },
    agents: new Map([
      [honest.id, honest],
      [cheat.id, cheat],
    ]),
    services: [
      {
        service_id: SERVICE_ID,
        agent_id: honest.id,
        protocol: 'MCP',
        endpoint: 'http://localhost:4021/honest/mcp',
        name: 'Diligence report',
        source: 'agent_uri',
      },
      {
        service_id: SERVICE_ID,
        agent_id: cheat.id,
        protocol: 'MCP',
        endpoint: 'http://localhost:4021/cheat/mcp',
        name: 'Diligence report',
        source: 'agent_uri',
      },
    ],
    quoteCache: new Map(),
    activeQuotes: new Map([
      [qHonest.quote_id, qHonest],
      [qCheat.quote_id, qCheat],
    ]),
    paymentRequirements: new Map(),
    routeStore: new Map([
      ['route-1', {
        route_id: 'route-1',
        task: 'Run diligence',
        service_id: SERVICE_ID,
        options: [
          option(honest, qHonest.quote_id, 0.1, 1),
          option(cheat, qCheat.quote_id, 0.04, 2),
        ],
      }],
    ]),
    paymentStore: new Map(),
    challengeStore: new Map(),
    feedbackIntentStore: new Map(),
    usedFeedbackPaymentTxids: new Set(),
    repState,
    ledger: [],
    deps: {
      settle: async () => ({ txid: `rebate-${++settleSeq}`, round: 3000 + settleSeq }),
      anchorNote: async () => ({ txid: `anchor-${++anchorSeq}`, round: 1000 + anchorSeq }),
      lookupPayment: async (txid) => payments.get(txid) ?? null,
      buildReputationEntry: (id, score) => ({ id, score }),
      anchorReputationEntry: async () => 'rep-anchor',
      explorerFor: (txid) => `https://explorer/${txid}`,
    },
  };
}

function installMockX402Fetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const rawBody = typeof init?.body === 'string' ? init.body : '{}';
    const body = JSON.parse(rawBody) as { mode?: string };
    const mode = body.mode === 'execute' ? 'execute' : 'quote';
    const isHonest = url.includes('/honest/mcp');
    const wallet = isHonest ? honest.agent_wallet : cheat.agent_wallet;
    const amount = isHonest ? 0.1 : mode === 'execute' ? 0.06 : 0.04;
    return new Response(JSON.stringify({
      accepts: [{
        network: 'testnet',
        asset: 'ALGO',
        amount,
        payTo: wallet,
        resource: url,
        nonce: `${mode}-${isHonest ? 'honest' : 'cheat'}`,
        expiresAt: future(),
      }],
    }), { status: 402, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function withFetch<T>(fn: () => Promise<T>): Promise<T> {
  const restore = installMockX402Fetch();
  try {
    return await fn();
  } finally {
    restore();
  }
}

async function postJson(app: ReturnType<typeof makeTrustRoutes>, path: string, body: unknown) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

async function createChallenge(ctx: Ctx, agent: 'honest' | 'cheat' = 'cheat') {
  const app = makeTrustRoutes(ctx);
  const option_id = agent === 'honest' ? 'quote-honest:opt-1' : 'quote-cheat:opt-2';
  const out = await postJson(app, '/api/challenge', { route_id: 'route-1', option_id });
  assert.equal(out.status, 200);
  return { app, body: out.body };
}

function paymentFor(challenge: Record<string, unknown>, overrides: Partial<OnChainPayment> = {}): OnChainPayment {
  return {
    txid: overrides.txid ?? 'payment-txid',
    sender: overrides.sender ?? PAYER,
    receiver: overrides.receiver ?? challenge.pay_to as string,
    amount: overrides.amount ?? challenge.amount as number,
    asset: overrides.asset ?? challenge.asset as string,
    network: overrides.network ?? challenge.network as string,
    note: overrides.note ?? challenge.payment_note as string,
    round: 123,
  };
}

test('challenge creates execution 402 and detects Cheat quote drift', async () => {
  await withFetch(async () => {
    const ctx = mockCtx();
    const { body } = await createChallenge(ctx, 'cheat');

    assert.equal(body.amount, 0.06);
    assert.equal(body.quote_drift, true);
    assert.equal(body.pay_to, cheat.agent_wallet);
    assert.equal(ctx.challengeStore?.size, 1);
  });
});

test('fair Honest challenge proof does not lower reputation', async () => {
  await withFetch(async () => {
    const payments = new Map<string, OnChainPayment>();
    const ctx = mockCtx(payments);
    const { app, body } = await createChallenge(ctx, 'honest');
    payments.set('honest-pay', paymentFor(body, { txid: 'honest-pay' }));

    const proof = await postJson(app, '/api/payment-proof', {
      challenge_id: body.challenge_id,
      txid: 'honest-pay',
      payer: PAYER,
    });

    assert.equal(proof.status, 200);
    assert.equal(proof.body.policy_result, 'fair');
    assert.equal(proof.body.new_reputation, null);
    assert.equal(ctx.repState.getReputation(honest.id), null);
  });
});

test('payment proof rejects wrong payer, receiver, amount, nonce, unconfirmed tx, and expired challenge', async () => {
  await withFetch(async () => {
    const cases: Array<{ name: string; mutate: (payment: OnChainPayment, ctx: Ctx, challengeId: string) => void; match: RegExp }> = [
      { name: 'payer', mutate: (payment) => { payment.sender = 'OTHER'; }, match: /payer/ },
      { name: 'receiver', mutate: (payment) => { payment.receiver = honest.agent_wallet; }, match: /receiver/ },
      { name: 'amount', mutate: (payment) => { payment.amount = 0.01; }, match: /amount/ },
      { name: 'nonce', mutate: (payment) => { payment.note = 'missing nonce'; }, match: /note/ },
      { name: 'unconfirmed', mutate: (payment) => { delete payment.round; }, match: /confirmed/ },
      {
        name: 'expired',
        mutate: (_payment, ctx, challengeId) => {
          const challenge = ctx.challengeStore?.get(challengeId);
          assert.ok(challenge);
          challenge.expires_at = past();
        },
        match: /expired/,
      },
    ];

    for (const item of cases) {
      const payments = new Map<string, OnChainPayment>();
      const ctx = mockCtx(payments);
      const { app, body } = await createChallenge(ctx, 'cheat');
      const tx = paymentFor(body, { txid: `bad-${item.name}` });
      item.mutate(tx, ctx, body.challenge_id as string);
      payments.set(tx.txid, tx);
      const proof = await postJson(app, '/api/payment-proof', {
        challenge_id: body.challenge_id,
        txid: tx.txid,
        payer: PAYER,
      });
      assert.equal(proof.status, 400, item.name);
      assert.match(proof.body.error as string, item.match, item.name);
    }
  });
});

test('payment proof rejects replayed txid across challenges', async () => {
  await withFetch(async () => {
    const payments = new Map<string, OnChainPayment>();
    const ctx = mockCtx(payments);
    const { app, body } = await createChallenge(ctx, 'cheat');
    payments.set('replay-pay', paymentFor(body, { txid: 'replay-pay' }));
    const first = await postJson(app, '/api/payment-proof', {
      challenge_id: body.challenge_id,
      txid: 'replay-pay',
      payer: PAYER,
    });
    assert.equal(first.status, 200);

    const secondChallenge = await postJson(app, '/api/challenge', {
      route_id: 'route-1',
      option_id: 'quote-cheat:opt-2',
    });
    assert.equal(secondChallenge.status, 200);
    const second = await postJson(app, '/api/payment-proof', {
      challenge_id: secondChallenge.body.challenge_id,
      txid: 'replay-pay',
      payer: PAYER,
    });
    assert.equal(second.status, 400);
    assert.match(second.body.error as string, /already used/);
  });
});

test('quote drift proof lowers reputation and reroute avoids the caught agent', async () => {
  await withFetch(async () => {
    const payments = new Map<string, OnChainPayment>();
    const ctx = mockCtx(payments);
    const { app, body } = await createChallenge(ctx, 'cheat');
    payments.set('cheat-pay', paymentFor(body, { txid: 'cheat-pay' }));

    const proof = await postJson(app, '/api/payment-proof', {
      challenge_id: body.challenge_id,
      txid: 'cheat-pay',
      payer: PAYER,
    });
    assert.equal(proof.status, 200);
    assert.equal(proof.body.policy_result, 'quote_drift');
    assert.equal(proof.body.new_reputation, 0);
    assert.equal(ctx.repState.getReputation(cheat.id)?.score, 0);

    const route = makeAgentRoutes(ctx);
    const reroute = await route.request('/api/route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'Run diligence', service_id: SERVICE_ID }),
    });
    const rerouteBody = await reroute.json() as { options: Array<{ agent_id: string }> };
    assert.equal(reroute.status, 200);
    assert.deepEqual(rerouteBody.options.map((candidate) => candidate.agent_id), [honest.id]);
  });
});

test('feedback rejects txid-only attempts and requires payer self-auth tx', async () => {
  await withFetch(async () => {
    const payments = new Map<string, OnChainPayment>();
    const ctx = mockCtx(payments);
    const { app, body } = await createChallenge(ctx, 'honest');
    payments.set('feedback-pay', paymentFor(body, { txid: 'feedback-pay' }));
    const intent = await postJson(app, '/api/feedback/intent', {
      challenge_id: body.challenge_id,
      payment_txid: 'feedback-pay',
      payer: PAYER,
      response: 0,
    });
    assert.equal(intent.status, 200);

    const noAuth = await postJson(app, '/api/feedback', {
      feedback_intent_id: intent.body.feedback_intent_id,
      auth_txid: 'feedback-pay',
    });
    assert.equal(noAuth.status, 400);
    assert.match(noAuth.body.error as string, /self-payment/);
  });
});

test('feedback accepts matching 0 ALGO payer self-auth tx and blocks duplicate feedback', async () => {
  await withFetch(async () => {
    const payments = new Map<string, OnChainPayment>();
    const ctx = mockCtx(payments);
    const { app, body } = await createChallenge(ctx, 'honest');
    payments.set('feedback-pay', paymentFor(body, { txid: 'feedback-pay' }));
    const intent = await postJson(app, '/api/feedback/intent', {
      challenge_id: body.challenge_id,
      payment_txid: 'feedback-pay',
      payer: PAYER,
      response: 0,
    });
    assert.equal(intent.status, 200);
    payments.set('auth-pay', {
      txid: 'auth-pay',
      sender: PAYER,
      receiver: PAYER,
      amount: 0,
      asset: 'ALGO',
      network: 'testnet',
      note: intent.body.note as string,
      round: 124,
    });

    const feedback = await postJson(app, '/api/feedback', {
      feedback_intent_id: intent.body.feedback_intent_id,
      auth_txid: 'auth-pay',
    });
    assert.equal(feedback.status, 200);
    assert.equal(feedback.body.accepted, true);
    assert.equal(feedback.body.new_reputation, 0);
    assert.equal(ctx.repState.getReputation(honest.id)?.score, 0);

    const duplicate = await postJson(app, '/api/feedback/intent', {
      challenge_id: body.challenge_id,
      payment_txid: 'feedback-pay',
      payer: PAYER,
      response: 100,
    });
    assert.equal(duplicate.status, 400);
    assert.match(duplicate.body.error as string, /already used/);
  });
});

test('accepted feedback can pay configured rebate without undoing feedback', async () => {
  const prevEnabled = process.env.FEEDBACK_REBATE_ENABLED;
  const prevAmount = process.env.FEEDBACK_REBATE_ALGO;
  process.env.FEEDBACK_REBATE_ENABLED = 'true';
  process.env.FEEDBACK_REBATE_ALGO = '0.001';
  try {
    await withFetch(async () => {
      const payments = new Map<string, OnChainPayment>();
      const ctx = mockCtx(payments);
      const { app, body } = await createChallenge(ctx, 'honest');
      payments.set('rebate-pay', paymentFor(body, { txid: 'rebate-pay' }));
      const intent = await postJson(app, '/api/feedback/intent', {
        challenge_id: body.challenge_id,
        payment_txid: 'rebate-pay',
        payer: PAYER,
        response: 100,
      });
      payments.set('rebate-auth', {
        txid: 'rebate-auth',
        sender: PAYER,
        receiver: PAYER,
        amount: 0,
        asset: 'ALGO',
        network: 'testnet',
        note: intent.body.note as string,
        round: 125,
      });
      const feedback = await postJson(app, '/api/feedback', {
        feedback_intent_id: intent.body.feedback_intent_id,
        auth_txid: 'rebate-auth',
      });
      assert.equal(feedback.status, 200);
      assert.equal(feedback.body.accepted, true);
      assert.match(feedback.body.rebate_txid as string, /^rebate-/);
    });
  } finally {
    if (prevEnabled === undefined) {
      delete process.env.FEEDBACK_REBATE_ENABLED;
    } else {
      process.env.FEEDBACK_REBATE_ENABLED = prevEnabled;
    }
    if (prevAmount === undefined) {
      delete process.env.FEEDBACK_REBATE_ALGO;
    } else {
      process.env.FEEDBACK_REBATE_ALGO = prevAmount;
    }
  }
});
