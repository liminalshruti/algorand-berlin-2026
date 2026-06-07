import "../src/load-env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { buildContext } from "../src/context.js";
import { payAgent } from "../src/pay.js";
import {
  seedAgents,
  fundAgents
} from "../src/seed.js";
import { makeValidationRoutes } from "../src/routes.validation.js";
import { makeAgentRoutes } from "../src/routes.agents.js";
import { makeTrustRoutes } from "../src/routes.trust.js";
import { makeStateRoutes } from "../src/routes.state.js";
import { applyKnownAgentRegistrations } from "../src/identity-onchain.js";
import { ingestAgentCardsFromManifest, refreshQuotes } from "../src/agents.js";

function logIdentityRegistrationPreflight() {
  const appId = process.env.IDENTITY_APP_ID?.trim();
  const submitter = process.env.IDENTITY_SUBMITTER_MNEMONIC?.trim();

  if (!appId) {
    console.warn("identity registration disabled: missing IDENTITY_APP_ID");
    return;
  }

  if (!submitter) {
    console.warn(
      `identity registration script disabled for app ${appId}: missing IDENTITY_SUBMITTER_MNEMONIC; ` +
      "run `npm run setup:testnet-identity` and fund the printed address before `npm run register:testnet-agents`."
    );
    return;
  }

  console.log(`identity registration script configured: app_id=${appId}`);
}

async function main() {
  const port = Number(process.env.PORT ?? 3001);
  const ctx = await buildContext();
  seedAgents(ctx);
  const cardIngestion = await ingestAgentCardsFromManifest(ctx, {
    warn: (message) => console.warn(message),
  });
  if (cardIngestion.status === "loaded") {
    console.log(`loaded ${cardIngestion.cards.length} TestNet agent cards`);
  }
  const mappedRegistrations = applyKnownAgentRegistrations(ctx);
  if (mappedRegistrations > 0) {
    console.log(`loaded ${mappedRegistrations} known TestNet agent registrations`);
  }
  const quoteWarmup = await refreshQuotes(ctx, undefined, {
    warn: (message) => console.warn(message),
  });
  if (quoteWarmup.snapshots.length > 0) {
    console.log(`warmed ${quoteWarmup.snapshots.length} x402 quote snapshots`);
  }
  logIdentityRegistrationPreflight();
  console.log("funding agents...");
  await fundAgents(ctx);
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

    const result = await payAgent(ctx, option);
    paidOptions.add(body.option_id);

    return c.json({
      payment_id: result.payment_id,
      agent_id: result.agent_id,
      quote_id: result.quote_id,
      settle_txid: result.txids[0],
      txids: result.txids,
      quoted_amount: result.quoted,
      settled_amount: result.settled,
      read: result.read
    });
  });

  app.get("/api/ledger", c => c.json({ anchors: ctx.ledger }));

  // --- Teammate routes (wired at H3–H4) ---
  app.route("/", makeValidationRoutes(ctx));
  app.route("/", makeTrustRoutes(ctx));
  app.route("/", makeAgentRoutes(ctx));
  app.route("/", makeStateRoutes(ctx));

  serve({ fetch: app.fetch, port }, () => {
    console.log(`\nrouter-server :${port}  network=${ctx.net}`);
    console.log(`payer:   ${ctx.session.payer.addr}\n`);

    console.log("--- discovered agents ---");
    for (const agent of ctx.agents.values()) {
      const service = ctx.services.find((s) => s.agent_id === agent.id);
      console.log(
        `  ${agent.name.padEnd(14)} id=${agent.id} service=${service?.service_id ?? "none"}`
      );
    }

    console.log("\n--- endpoints ---");
    console.log("  POST /api/route   { task, service_id? }");
    console.log("  POST /api/challenge { route_id, option_id }");
    console.log("  POST /api/payment-proof { challenge_id, txid, payer }");
    console.log("  POST /api/feedback/intent { challenge_id, payment_txid, payer, response }");
    console.log("  POST /api/feedback { feedback_intent_id, auth_txid }");
    console.log("  POST /api/pay     { route_id, option_id }");
    console.log("  POST /api/validate { payment_id }");
    console.log("  GET  /api/reputation?agent=");
    console.log("  GET  /api/ledger");
    console.log("  GET  /api/agents");
    console.log("  GET  /api/services");
    console.log("  GET  /api/state");
    console.log("  POST /api/agents/register { name, agent_uri, address }");
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
