import { test } from "node:test";
import assert from "node:assert/strict";
import { makeValidationRoutes } from "./routes.validation.js";
import type { Ctx, Provider, PaymentResult } from "./contract.js";

// ---- helpers ----
const ADDR = (ch: string) => ch.repeat(58).slice(0, 58);

function provider(id: string, quality: number, dishonest = false): Provider {
  return { id, name: id, register: ADDR("A"), quote: 0.1, asset: "ALGO", quality, dishonest, agent_uri: "https://a" };
}
function payment(payment_id: string, provider_id: string, quoted: number, settled: number): PaymentResult {
  return { payment_id, provider_id, quoted, settled, txids: ["SETTLETX0001"], read: "ok" };
}

let anchorSeq = 0;
function makeCtx(opts: { anchorThrows?: boolean } = {}): Ctx {
  const acct = { addr: ADDR("Z"), sk: new Uint8Array(0) };
  return {
    net: "testnet",
    store: {},
    session: { payer: acct, facilitator: acct, funded: acct },
    providers: new Map<string, Provider>(),
    routeStore: new Map(),
    paymentStore: new Map<string, PaymentResult>(),
    repState: { getReputation: () => null },
    ledger: [],
    deps: {
      settle: async () => ({ txid: "x", round: 1 }),
      anchorNote: async () => {
        if (opts.anchorThrows) throw new Error("algod unreachable");
        anchorSeq++;
        return { txid: `anchor-${anchorSeq}`, round: 1000 + anchorSeq };
      },
      buildReputationEntry: () => ({}),
      anchorReputationEntry: async () => "x",
      explorerFor: (t: string) => `https://explorer/${t}`,
    },
  };
}

// honest (price matches, high quality), cheat (settled > quoted), partial (price ok, low quality)
function setup(opts: { anchorThrows?: boolean } = {}) {
  const ctx = makeCtx(opts);
  const honest = provider("prov-honest", 0.9, false);
  const cheat = provider("prov-cheat", 0.3, true);
  const partial = provider("prov-partial", 0.5, false);
  for (const p of [honest, cheat, partial]) ctx.providers.set(p.id, p);
  ctx.paymentStore.set("pay-honest", payment("pay-honest", honest.id, 0.1, 0.1));
  ctx.paymentStore.set("pay-cheat", payment("pay-cheat", cheat.id, 0.04, 0.06));
  ctx.paymentStore.set("pay-partial", payment("pay-partial", partial.id, 0.1, 0.1));
  const app = makeValidationRoutes(ctx);
  return { ctx, app, honest, cheat, partial };
}

type Json = Record<string, unknown>;
async function postValidate(app: ReturnType<typeof makeValidationRoutes>, payment_id: string) {
  const res = await app.request("/api/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payment_id }),
  });
  return { status: res.status, body: (await res.json()) as Json };
}
async function getReputation(app: ReturnType<typeof makeValidationRoutes>, provider: string) {
  const res = await app.request(`/api/reputation?provider=${encodeURIComponent(provider)}`);
  return { status: res.status, body: (await res.json()) as Json };
}

// ---- POST /api/validate ----
test("honest payment → full pass, reputation 100, verdict anchored to the ledger", async () => {
  const { app, ctx } = setup();
  const { status, body } = await postValidate(app, "pay-honest");
  assert.equal(status, 200);
  assert.equal(body.price_match, true);
  assert.equal(body.output_pass, true);
  assert.equal(body.response, 100);
  assert.equal(body.new_reputation, 100);
  assert.match(body.verdict_txid as string, /^anchor-/);
  assert.equal(body.on_chain_feedback_txid, null); // REPUTATION_APP_ID unset → no on-chain write
  assert.equal(typeof body.validation_id, "string");
  assert.equal(ctx.ledger.length, 1);
  assert.equal(ctx.ledger[0].schema, "liminal.validation.v1");
  assert.equal(ctx.ledger[0].ref_id, "pay-honest");
  assert.equal(ctx.ledger[0].network, "testnet");
});

test("cheat payment (settled > quoted) → price mismatch, reputation drops to 0", async () => {
  const { app } = setup();
  const { body } = await postValidate(app, "pay-cheat");
  assert.equal(body.price_match, false);
  assert.equal(body.response, 0);
  assert.equal(body.new_reputation, 0);
});

test("partial (price ok, quality below threshold) → response 60, corrected", async () => {
  const { app } = setup();
  const { body } = await postValidate(app, "pay-partial");
  assert.equal(body.price_match, true);
  assert.equal(body.output_pass, false);
  assert.equal(body.response, 60);
  assert.equal(body.new_reputation, 0); // 1 read, 1 correction
});

test("validating a cheat updates ctx.repState so ranking reroutes on re-run", async () => {
  const { app, ctx, cheat } = setup();
  await postValidate(app, "pay-cheat");
  const r = ctx.repState.getReputation(cheat.id);
  assert.notEqual(r, null);
  assert.equal(r!.score, 0); // /api/route drops a 0-score provider
});

test("unknown payment_id → 400", async () => {
  const { app } = setup();
  const { status, body } = await postValidate(app, "does-not-exist");
  assert.equal(status, 400);
  assert.equal(body.error, "unknown payment_id");
});

test("malformed body → 400 (parse failure falls through to unknown payment)", async () => {
  const { app } = setup();
  const res = await app.request("/api/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ not json",
  });
  assert.equal(res.status, 400);
});

test("anchor failure is non-fatal — verdict still returns, nothing is logged", async () => {
  const { app, ctx } = setup({ anchorThrows: true });
  const { status, body } = await postValidate(app, "pay-honest");
  assert.equal(status, 200);
  assert.equal(body.response, 100);
  assert.equal(body.verdict_txid, "");
  assert.equal(ctx.ledger.length, 0);
});

// ---- GET /api/reputation ----
test("reputation reflects a caught cheat with the correction tag", async () => {
  const { app } = setup();
  await postValidate(app, "pay-cheat");
  const { status, body } = await getReputation(app, "prov-cheat");
  assert.equal(status, 200);
  assert.equal(body.score, 0);
  assert.equal(body.reads_logged, 1);
  assert.equal(body.corrections_logged, 1);
  assert.deepEqual(body.by_tag, { missed_compensation: 1 });
  assert.equal(body.uri, "liminal://corrections/prov-cheat");
  assert.ok((body.hash as string).length > 0);
});

test("reputation for an unseen provider → nulls, never throws", async () => {
  const { app } = setup();
  const { status, body } = await getReputation(app, "ghost");
  assert.equal(status, 200);
  assert.equal(body.score, null);
  assert.equal(body.reads_logged, 0);
  assert.deepEqual(body.by_tag, {});
});
