import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { buildContext } from "../lib/router/context.js";
import { payProvider } from "../lib/router/pay.js";
import {
  seedProviders,
  seedTestRoute,
  fundProviders
} from "../lib/router/seed.js";
import { makeProviderRoutes } from "../lib/router/routes.providers.js";
import { makeValidationRoutes } from "../lib/router/routes.validation.js";

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  const ctx = await buildContext();
  seedProviders(ctx);
  console.log("funding providers...");
  await fundProviders(ctx);
  seedTestRoute(ctx);
  const app = new Hono();
  app.use("*", cors());

  // --- Navid: payment + ledger ---

  const paidOptions = new Set<string>();

  app.post("/api/pay", async c => {
    const body = await c.req.json<{ route_id: string; option_id: string }>();

    const route = ctx.routeStore.get(body.route_id);
    if (!route) return c.json({ error: "Unknown route_id" }, 400);

    const option = route.options.find(o => o.option_id === body.option_id);
    if (!option) return c.json({ error: "Unknown option_id" }, 400);

    if (paidOptions.has(body.option_id)) return c.json({ error: "Replay rejected" }, 400);

    const result = await payProvider(ctx, option);
    paidOptions.add(body.option_id);

    return c.json({
      payment_id: result.payment_id,
      settle_txid: result.txids[0],
      txids: result.txids,
      quoted_amount: result.quoted,
      settled_amount: result.settled,
      read: result.read
    });
  });

  app.get("/api/ledger", c => c.json({ anchors: ctx.ledger }));

  // --- Teammate routes (wired at H3–H4) ---
  app.route("/", makeProviderRoutes(ctx));
  app.route("/", makeValidationRoutes(ctx));

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`\nrouter-server :${PORT}  network=${ctx.net}`);
    console.log(`payer:   ${ctx.session.payer.addr}\n`);

    console.log("--- seeded providers ---");
    for (const p of ctx.providers.values()) {
      console.log(
        `  ${p.dishonest ? "🔴 CHEAT" : "🟢 honest"}  ${p.name.padEnd(14)} ${p.quote} ALGO  id=${p.id}`
      );
    }

    console.log("\n--- endpoints ---");
    console.log("  POST /api/route   { task, register }");
    console.log("  POST /api/pay     { route_id, option_id }");
    console.log("  POST /api/validate { payment_id }");
    console.log("  GET  /api/reputation?provider=");
    console.log("  GET  /api/ledger");
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
