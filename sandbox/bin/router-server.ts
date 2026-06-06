import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { buildContext } from '../lib/router/context.js';
import { payProvider } from '../lib/router/pay.js';
import { makeProviderRoutes } from '../lib/router/routes.providers.js';
import { makeValidationRoutes } from '../lib/router/routes.validation.js';

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  const ctx = await buildContext();
  const app = new Hono();

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

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`router-server :${PORT}  network=${ctx.net}`);
    console.log(`payer: ${ctx.session.payer.addr}`);
    console.log('routes:', [
      'POST /api/pay',
      'GET  /api/ledger',
      'POST /api/route  (Reza)',
      'POST /api/validate  (Shayaun)',
      'GET  /api/reputation  (Shayaun)',
    ].join('\n       '));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
