// UI lane — read-only state snapshot. Serializes the in-memory ctx Maps the
// per-call responses never expose (payments, challenges, active quotes) and
// pairs each record with its on-chain anchor txid + explorer URL where one
// exists. The pattern: off-chain reasoning is the substance, the txid is the
// proof badge hung next to it. No mutation — pure read of shared ctx.
import { Hono } from 'hono';
import type { Ctx } from './contract.js';
import type { RouterRepState } from './reputation-state.js';
import { registryAgentIdFor } from './identity-onchain.js';

const MAX_ROWS = 50; // newest-first cap; demo state is tiny, this is just defensive

// repState is the base RepState in the type, but routes.validation.ts swaps in a
// RouterRepState with full() (score + corrections + by_tag). Feature-detect so a
// stub repState still serializes cleanly instead of throwing.
function reputationOf(ctx: Ctx, agent_id: string) {
  const rep = ctx.repState as Partial<RouterRepState>;
  if (typeof rep.full === 'function') return rep.full(agent_id);
  const basic = ctx.repState.getReputation(agent_id);
  return basic ? { ...basic, by_tag: {} as Record<string, number> } : null;
}

export function makeStateRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  const explorer = (txid?: string) => (txid ? ctx.deps.explorerFor(txid) : null);
  const newest = <T>(xs: Iterable<T>) => [...xs].reverse().slice(0, MAX_ROWS);

  app.get('/api/state', (c) => {
    const agents = [...ctx.agents.values()].map((agent) => ({
      agent_id: agent.id,
      name: agent.name,
      registry_agent_id: registryAgentIdFor(agent.id) ?? null,
      agent_wallet: agent.agent_wallet,
      reputation: reputationOf(ctx, agent.id), // { score, reads_logged, corrections_logged, by_tag } | null
    }));

    // quoted vs settled is the whole story; surface the gap pre-computed.
    const payments = newest(ctx.paymentStore.values()).map((p) => ({
      payment_id: p.payment_id,
      agent_id: p.agent_id,
      quote_id: p.quote_id,
      quoted: p.quoted,
      settled: p.settled,
      drift: Math.round((p.settled - p.quoted) * 1e6) / 1e6,
      over_quote: p.settled > p.quoted + 1e-9,
      txids: p.txids,
      explorer: explorer(p.txids[0]),
      read: p.read,
    }));

    // active x402 challenge vs the pinned quote — quote_drift is the caught lie.
    const challenges = newest(ctx.challengeStore?.values() ?? []).map((ch) => ({
      challenge_id: ch.challenge_id,
      agent_id: ch.agent_id,
      route_id: ch.route_id,
      quote_amount: ch.quote_amount,
      challenge_amount: ch.amount,
      asset: ch.asset,
      pay_to: ch.pay_to,
      quote_drift: ch.quote_drift,
      payment_note: ch.payment_note,
      payment_txid: ch.payment_txid ?? null,
      explorer: explorer(ch.payment_txid),
      validation_txid: ch.validation_txid ?? null,
      observed_at: ch.observed_at,
    }));

    const active_quotes = newest(ctx.activeQuotes.values()).map((q) => ({
      quote_id: q.quote_id,
      agent_id: q.agent_id,
      service_id: q.service_id,
      amount: q.amount,
      asset: q.asset,
      pay_to: q.pay_to,
      observed_at: q.observed_at,
      expires_at: q.expires_at,
    }));

    // ledger entries already carry their txid; attach the explorer URL inline.
    const ledger = newest(ctx.ledger).map((a) => ({ ...a, explorer: explorer(a.txid) }));

    return c.json({
      network: ctx.net,
      generated_at: new Date().toISOString(),
      counts: {
        agents: agents.length,
        payments: ctx.paymentStore.size,
        challenges: ctx.challengeStore?.size ?? 0,
        anchors: ctx.ledger.length,
      },
      agents,
      payments,
      challenges,
      active_quotes,
      ledger,
    });
  });

  return app;
}
