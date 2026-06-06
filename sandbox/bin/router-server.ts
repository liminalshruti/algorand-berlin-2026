import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { buildContext } from '../lib/router/context.js';
import { payProvider } from '../lib/router/pay.js';
import { seedProviders, seedTestRoute } from '../lib/router/seed.js';
import { v4 as uuidv4 } from 'uuid';
import { TRUST_WEIGHTS, type RouteOption } from '../lib/router/contract.js';
import { makeProviderRoutes } from '../lib/router/routes.providers.js';
import { makeValidationRoutes } from '../lib/router/routes.validation.js';

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  const ctx = await buildContext();
  seedProviders(ctx);
  const { route_id } = seedTestRoute(ctx);
  const app = new Hono();
  app.use('*', cors());

  // --- Navid: payment + ledger ---

  app.post('/api/pay', async (c) => {
    const body = await c.req.json<{ route_id: string; option_id: string }>();

    const route = ctx.routeStore.get(body.route_id);
    if (!route) return c.json({ error: 'Unknown route_id' }, 400);

    const option = route.options.find((o) => o.option_id === body.option_id);
    if (!option) return c.json({ error: 'Unknown option_id' }, 400);

    // replay guard — same option cannot be paid twice
    const alreadyPaid = [...ctx.paymentStore.values()].some(
      (p) => p.provider_id === option.provider_id && route.options.includes(option),
    );
    if (alreadyPaid) return c.json({ error: 'Replay rejected' }, 400);

    const result = await payProvider(ctx, option);

    return c.json({
      payment_id: result.payment_id,
      settle_txid: result.txids[0],
      txids: result.txids,
      quoted_amount: result.quoted,
      settled_amount: result.settled,
      read: result.read,
    });
  });

  app.get('/api/ledger', (c) => c.json({ anchors: ctx.ledger }));

  // --- Teammate routes (wired at H3–H4) ---
  app.route('/', makeProviderRoutes(ctx));
  app.route('/', makeValidationRoutes(ctx));

  // --- TEMP integration stub: POST /api/route (Reza's lane) ----------------
  // Stand-in until Reza's makeProviderRoutes(ctx) serves /api/route. Registered
  // AFTER the teammate mount above, so the moment Reza lands his real handler it
  // wins (Hono runs the first-registered match) and this becomes dead code —
  // delete it at that integration point. Shape mirrors the frozen API and
  // public/router.js exactly: reputation 0..100, validation_rate 0..1,
  // trust_score & weight on a 0..100 scale.
  app.post('/api/route', async (c) => {
    const body = await c.req
      .json<{ task?: string; register?: string }>()
      .catch(() => ({} as { task?: string; register?: string }));
    const task = body.task ?? 'demo';

    // Discovery stub: every seeded provider competes (register/task filtering is Reza's).
    // reputation is live from repState when present (→ reroute-ready once Shayaun writes
    // back), else a quality-derived stand-in; validation_rate likewise derived for now.
    const scored = [...ctx.providers.values()].map((p) => {
      const rep = ctx.repState.getReputation(p.id);
      return {
        p,
        reputation: rep ? rep.score : Math.round(p.quality * 100),
        validation_rate: p.dishonest ? 0.2 : p.quality,
      };
    });

    // Zero-reputation excluded (ARC-8004 getSummary spirit / DoD): no validated history
    // → held out of the lottery, surfaced separately so the UI can show "held".
    const ranked = scored.filter((s) => s.reputation > 0);
    const excluded = scored
      .filter((s) => s.reputation <= 0)
      .map((s) => ({ provider_id: s.p.id, name: s.p.name, reason: 'no validated history' }));

    // trust_score MUST match public/router.js trustParts() so the headline equals the
    // client-side breakdown bars. Weights come from the frozen contract.
    const prices = ranked.map((s) => s.p.quote);
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;
    const trustOf = (price: number, reputation: number, validation_rate: number) =>
      (max === min ? 1 : (max - price) / (max - min)) * TRUST_WEIGHTS.price +
      (reputation / 100) * TRUST_WEIGHTS.reputation +
      validation_rate * TRUST_WEIGHTS.validation;

    const withTrust = ranked.map((s) => ({ ...s, t: trustOf(s.p.quote, s.reputation, s.validation_rate) }));
    const sum = withTrust.reduce((a, s) => a + s.t, 0) || 1;

    const options: RouteOption[] = withTrust
      .map((s) => ({
        option_id: `opt_${s.p.id.split(':').pop()!.slice(0, 6)}`,
        provider_id: s.p.id,
        name: s.p.name,
        price: s.p.quote,
        reputation: s.reputation,
        validation_rate: s.validation_rate,
        trust_score: Math.round(s.t * 1000) / 10,
        weight: Math.round((s.t / sum) * 1000) / 10,
      }))
      .sort((a, b) => b.trust_score - a.trust_score);

    const route_id = uuidv4();
    ctx.routeStore.set(route_id, { route_id, task, options });
    return c.json({ route_id, task, register: body.register, options, excluded });
  });

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`\nrouter-server :${PORT}  network=${ctx.net}`);
    console.log(`payer:   ${ctx.session.payer.addr}\n`);

    console.log('--- seeded providers ---');
    for (const p of ctx.providers.values()) {
      console.log(`  ${p.dishonest ? '🔴 CHEAT' : '🟢 honest'}  ${p.name.padEnd(14)} ${p.quote} ALGO  id=${p.id}`);
    }

    const route = ctx.routeStore.get(route_id)!;
    console.log(`\n--- test route (use before Reza lands /api/route) ---`);
    console.log(`  route_id: ${route_id}`);
    for (const o of route.options) {
      console.log(`  option_id: ${o.option_id}  →  ${o.name}`);
    }

    console.log('\n--- endpoints ---');
    console.log('  POST /api/route { task, register }    (TEMP stub — Reza overrides)');
    console.log('  POST /api/pay   { route_id, option_id }');
    console.log('  GET  /api/ledger');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
