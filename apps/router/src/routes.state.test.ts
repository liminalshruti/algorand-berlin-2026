import { test } from "node:test";
import assert from "node:assert/strict";
import { makeStateRoutes } from "./routes.state.js";
import { createRepState } from "./reputation-state.js";
import { validate } from "./validation.js";
import type {
  ActiveQuote,
  Agent,
  Ctx,
  LedgerEntry,
  PaymentChallenge,
  PaymentResult,
  RepState,
} from "./contract.js";

// In-process tests for GET /api/state — no network. Drives the route via
// app.request() against hand-built ctx Maps, the same idiom as
// routes.validation.test.ts. Verifies the read-only serializer pairs each
// in-memory record with its explorer link and computes quote drift.

const ADDR = (ch: string) => ch.repeat(58).slice(0, 58);
type Json = Record<string, unknown>;

function agent(id: string, name: string, wallet: string): Agent {
  return { id, name, agent_uri: `https://agents.local/${id}`, agent_wallet: wallet };
}

function payment(
  payment_id: string,
  agent_id: string,
  quoted: number,
  settled: number,
  txid = "SETTLETX0001",
): PaymentResult {
  return { payment_id, agent_id, quote_id: `quote-${agent_id}`, quoted, settled, txids: [txid], read: "ok" };
}

function challenge(challenge_id: string, agent_id: string, over: Partial<PaymentChallenge> = {}): PaymentChallenge {
  return {
    challenge_id,
    route_id: "route-1",
    option_id: "opt-1",
    agent_id,
    service_id: "diligence.report",
    quote_id: "quote-1",
    nonce: "nonce-1",
    resource: "diligence.report",
    amount: 0.06,
    asset: "ALGO",
    pay_to: ADDR("P"),
    network: "testnet",
    quote_amount: 0.04,
    quote_pay_to: ADDR("P"),
    quote_expires_at: "2026-06-07T01:00:00Z",
    payment_note: "x402:demo:nonce-1",
    quote_drift: true,
    observed_at: "2026-06-07T00:00:00Z",
    expires_at: "2026-06-07T01:00:00Z",
    ...over,
  };
}

function quote(quote_id: string, agent_id: string): ActiveQuote {
  return {
    quote_id,
    agent_id,
    service_id: "diligence.report",
    amount: 0.1,
    asset: "ALGO",
    pay_to: ADDR("P"),
    observed_at: "2026-06-07T00:00:00Z",
    expires_at: "2026-06-07T01:00:00Z",
  };
}

function ledgerEntry(txid: string, schema = "x402.settle", ref_id = "pay-1"): LedgerEntry {
  return { txid, schema, ref_id, hash: "deadbeefcafe", round: 1234, network: "testnet" };
}

function makeCtx(opts: { repState?: RepState } = {}): Ctx {
  const acct = { addr: ADDR("Z"), sk: new Uint8Array(0) };
  return {
    net: "testnet",
    store: {},
    session: { payer: acct, facilitator: acct, funded: acct },
    agents: new Map(),
    services: [],
    quoteCache: new Map(),
    activeQuotes: new Map(),
    paymentRequirements: new Map(),
    routeStore: new Map(),
    paymentStore: new Map<string, PaymentResult>(),
    challengeStore: new Map<string, PaymentChallenge>(),
    feedbackIntentStore: new Map(),
    usedFeedbackPaymentTxids: new Set(),
    repState: opts.repState ?? createRepState(),
    ledger: [],
    deps: {
      settle: async () => ({ txid: "x", round: 1 }),
      anchorNote: async () => ({ txid: "anchor", round: 1 }),
      lookupPayment: async () => null,
      buildReputationEntry: () => ({}),
      anchorReputationEntry: async () => "x",
      explorerFor: (t: string) => `https://explorer/${t}`,
    },
  };
}

async function getState(app: ReturnType<typeof makeStateRoutes>) {
  const res = await app.request("/api/state");
  return { status: res.status, body: (await res.json()) as Json };
}

test("empty state -> 200, zero counts, empty arrays", async () => {
  const { status, body } = await getState(makeStateRoutes(makeCtx()));
  assert.equal(status, 200);
  assert.equal(body.network, "testnet");
  assert.equal(typeof body.generated_at, "string");
  assert.deepEqual(body.counts, { agents: 0, payments: 0, challenges: 0, anchors: 0 });
  assert.deepEqual(body.agents, []);
  assert.deepEqual(body.payments, []);
  assert.deepEqual(body.challenges, []);
  assert.deepEqual(body.active_quotes, []);
  assert.deepEqual(body.ledger, []);
});

test("agent reputation serializes with score, corrections, and by_tag (full path)", async () => {
  const rep = createRepState();
  rep.writeBack("agent-cheat", validate(payment("p1", "agent-cheat", 0.1, 0.1))); // clean read
  rep.writeBack("agent-cheat", validate(payment("p2", "agent-cheat", 0.04, 0.06))); // quote drift
  const ctx = makeCtx({ repState: rep });
  ctx.agents.set("agent-cheat", agent("agent-cheat", "Cheat Agent", ADDR("C")));
  const { body } = await getState(makeStateRoutes(ctx));
  const agents = body.agents as Json[];
  assert.equal(agents.length, 1);
  assert.equal(agents[0].agent_id, "agent-cheat");
  assert.equal(agents[0].name, "Cheat Agent");
  assert.equal(agents[0].agent_wallet, ADDR("C"));
  assert.equal(agents[0].registry_agent_id, null); // no on-chain evidence applied in tests
  const r = agents[0].reputation as Json;
  assert.equal(r.score, 50);
  assert.equal(r.reads_logged, 2);
  assert.equal(r.corrections_logged, 1);
  assert.deepEqual(r.by_tag, { missed_compensation: 1 });
});

test("reputation falls back to getReputation when repState lacks full() (by_tag empty)", async () => {
  const ctx = makeCtx({ repState: { getReputation: () => ({ score: 80, reads_logged: 5, corrections_logged: 1 }) } });
  ctx.agents.set("a1", agent("a1", "Agent One", ADDR("A")));
  const { body } = await getState(makeStateRoutes(ctx));
  const r = (body.agents as Json[])[0].reputation as Json;
  assert.equal(r.score, 80);
  assert.equal(r.reads_logged, 5);
  assert.equal(r.corrections_logged, 1);
  assert.deepEqual(r.by_tag, {});
});

test("agent with no reputation history -> reputation null", async () => {
  const ctx = makeCtx({ repState: { getReputation: () => null } });
  ctx.agents.set("a1", agent("a1", "New Agent", ADDR("A")));
  const { body } = await getState(makeStateRoutes(ctx));
  assert.equal((body.agents as Json[])[0].reputation, null);
});

test("payments serialize quoted/settled with drift, over_quote, and explorer link", async () => {
  const ctx = makeCtx();
  ctx.paymentStore.set("pay-honest", payment("pay-honest", "agent-honest", 0.1, 0.1, "TXHONEST"));
  ctx.paymentStore.set("pay-cheat", payment("pay-cheat", "agent-cheat", 0.04, 0.06, "TXCHEAT"));
  const { body } = await getState(makeStateRoutes(ctx));
  assert.equal((body.counts as Json).payments, 2);
  const pays = body.payments as Json[];
  assert.equal(pays[0].payment_id, "pay-cheat"); // newest-first
  assert.equal(pays[0].over_quote, true);
  assert.equal(pays[0].drift, 0.02);
  assert.equal(pays[0].explorer, "https://explorer/TXCHEAT");
  assert.deepEqual(pays[0].txids, ["TXCHEAT"]);
  const honest = pays.find((p) => p.payment_id === "pay-honest") as Json;
  assert.equal(honest.over_quote, false);
  assert.equal(honest.drift, 0);
  assert.equal(honest.explorer, "https://explorer/TXHONEST");
});

test("challenges serialize quote vs challenge amount, quote_drift, and paid explorer", async () => {
  const ctx = makeCtx();
  ctx.challengeStore!.set("ch-1", challenge("ch-1", "agent-cheat", { payment_txid: "TXPAID", validation_txid: "TXVAL" }));
  ctx.challengeStore!.set("ch-2", challenge("ch-2", "agent-honest", { quote_drift: false, amount: 0.1, quote_amount: 0.1 }));
  const { body } = await getState(makeStateRoutes(ctx));
  assert.equal((body.counts as Json).challenges, 2);
  const chs = body.challenges as Json[];
  const c1 = chs.find((c) => c.challenge_id === "ch-1") as Json;
  assert.equal(c1.quote_drift, true);
  assert.equal(c1.quote_amount, 0.04);
  assert.equal(c1.challenge_amount, 0.06); // mapped from PaymentChallenge.amount
  assert.equal(c1.payment_txid, "TXPAID");
  assert.equal(c1.explorer, "https://explorer/TXPAID");
  assert.equal(c1.validation_txid, "TXVAL");
  const c2 = chs.find((c) => c.challenge_id === "ch-2") as Json;
  assert.equal(c2.quote_drift, false);
  assert.equal(c2.payment_txid, null); // no settlement yet
  assert.equal(c2.explorer, null);
});

test("ledger entries pass through with an explorer link attached", async () => {
  const ctx = makeCtx();
  ctx.ledger.push(ledgerEntry("TXLEDGER", "trust-router.validation.v1", "pay-cheat"));
  const { body } = await getState(makeStateRoutes(ctx));
  assert.equal((body.counts as Json).anchors, 1);
  const l = (body.ledger as Json[])[0];
  assert.equal(l.txid, "TXLEDGER");
  assert.equal(l.schema, "trust-router.validation.v1");
  assert.equal(l.ref_id, "pay-cheat");
  assert.equal(l.explorer, "https://explorer/TXLEDGER");
});

test("active quotes serialize the pinned listing", async () => {
  const ctx = makeCtx();
  ctx.activeQuotes.set("q-1", quote("q-1", "agent-honest"));
  const { body } = await getState(makeStateRoutes(ctx));
  const qs = body.active_quotes as Json[];
  assert.equal(qs.length, 1);
  assert.equal(qs[0].quote_id, "q-1");
  assert.equal(qs[0].agent_id, "agent-honest");
  assert.equal(qs[0].amount, 0.1);
  assert.equal(qs[0].pay_to, ADDR("P"));
});
