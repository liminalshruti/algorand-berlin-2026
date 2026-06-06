// Shayaun's lane — Validation + Reputation routes (router glue).
import { Hono } from 'hono';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Ctx } from './contract.js';
import { validate } from './validation.js';
import { createRepState } from './reputation-state.js';

/**
 * Wires the frozen API:
 *   POST /api/validate   { payment_id } → { validation_id, price_match, output_pass, response, new_reputation, verdict_txid }
 *   GET  /api/reputation?provider=…     → { provider_id, score, reads_logged, corrections_logged, by_tag, uri, hash }
 *
 * Verdict = price-vs-quote (validation.ts) → reputation write-back → hash-only anchor on
 * Algorand via ctx.deps.anchorNote (real txid on LocalNet; skipped gracefully if down).
 * Injects the live repState into ctx so /api/route + Reza's ranking reroute on re-run.
 *
 * Production seam (on-chain): also call ValidationRegistry.validationResponse and
 * ReputationRegistry.giveFeedback (with x402 paymentTxid + nonce) via the generated
 * clients in smart_contracts/artifacts/* once their app-ids are configured.
 */
export function makeValidationRoutes(ctx: Ctx): Hono {
  const rep = createRepState();
  ctx.repState = rep; // live reputation source for ranking/route → enables the reroute

  const app = new Hono();

  app.post('/api/validate', async (c) => {
    const { payment_id } = await c.req
      .json<{ payment_id: string }>()
      .catch(() => ({ payment_id: '' }));

    const pay = ctx.paymentStore.get(payment_id);
    if (!pay) return c.json({ error: 'unknown payment_id' }, 400);

    const provider = ctx.providers.get(pay.provider_id);
    const v = validate(pay, provider);
    const newRep = rep.writeBack(pay.provider_id, v);

    // hash-only verdict anchor — note carries only the schema + hash, never content
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ payment_id, ...v }))
      .digest('hex');
    let verdict_txid = '';
    try {
      const a = await ctx.deps.anchorNote(payment_id, 'liminal.validation.v1', hash);
      verdict_txid = a.txid;
      ctx.ledger.push({
        txid: a.txid,
        schema: 'liminal.validation.v1',
        ref_id: payment_id,
        hash,
        round: a.round,
        network: ctx.net,
      });
    } catch (_) {
      // LocalNet/algod not reachable → skip the anchor; the verdict still returns.
    }

    return c.json({
      validation_id: uuidv4(),
      price_match: v.price_match,
      output_pass: v.output_pass,
      response: v.response,
      new_reputation: newRep.score,
      verdict_txid,
    });
  });

  app.get('/api/reputation', (c) => {
    const provider = c.req.query('provider') ?? '';
    const full = rep.full(provider);
    if (!full) {
      return c.json({ provider_id: provider, score: null, reads_logged: 0, corrections_logged: 0, by_tag: {}, uri: '', hash: '' });
    }
    return c.json({
      provider_id: provider,
      score: full.score,
      reads_logged: full.reads_logged,
      corrections_logged: full.corrections_logged,
      by_tag: full.by_tag,
      uri: `liminal://corrections/${provider}`,
      hash: crypto.createHash('sha256').update(`${provider}:${full.reads_logged}:${full.corrections_logged}`).digest('hex'),
    });
  });

  return app;
}
