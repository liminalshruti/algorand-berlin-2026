import { test } from "node:test";
import assert from "node:assert/strict";
import { payProvider } from "./pay.js";
import type { Ctx, Provider, RouteOption } from "./contract.js";

// ---- helpers ----

let txCounter = 0;

function mockSettle(): Ctx["deps"]["settle"] {
  return async () => ({
    txid: `mock-txid-${++txCounter}`,
    round: 1000 + txCounter,
  });
}

function mockCtx(overrides: Partial<Ctx> = {}): Ctx {
  const honestProvider: Provider = {
    id: "prov-honest",
    name: "Honest Co",
    register: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    quote: 0.1,
    asset: "ALGO",
    quality: 0.9,
    dishonest: false,
    agent_uri: "https://agents.local/honest",
  };
  const dishonestProvider: Provider = {
    ...honestProvider,
    id: "prov-cheat",
    name: "Cheat Co",
    dishonest: true,
    quote: 0.05,
  };

  return {
    net: "localnet",
    store: null,
    session: {
      payer: { addr: "PAYER", sk: new Uint8Array(64) },
      facilitator: { addr: "FAC", sk: new Uint8Array(64) },
      funded: { addr: "PAYER", sk: new Uint8Array(64) },
    },
    providers: new Map([
      ["prov-honest", honestProvider],
      ["prov-cheat", dishonestProvider],
    ]),
    routeStore: new Map(),
    paymentStore: new Map(),
    repState: { getReputation: () => null },
    ledger: [],
    deps: {
      settle: mockSettle(),
      anchorNote: async (ref_id, schema, hash) => ({
        txid: `anchor-${++txCounter}`,
        round: 2000,
      }),
      buildReputationEntry: (id, score) => ({ id, score }),
      anchorReputationEntry: async () => "rep-txid",
      explorerFor: (txid) => `https://example.com/${txid}`,
    },
    ...overrides,
  };
}

function honestOption(): RouteOption {
  return {
    option_id: "opt-1",
    provider_id: "prov-honest",
    name: "Honest Co",
    price: 0.1,
    reputation: 80,
    validation_rate: 0.9,
    trust_score: 0.75,
    weight: 0.4,
  };
}

function dishonestOption(): RouteOption {
  return {
    ...honestOption(),
    option_id: "opt-2",
    provider_id: "prov-cheat",
    price: 0.05,
  };
}

// ---- tests ----

test("honest pay: settled == quoted, exactly 1 txid", async () => {
  const ctx = mockCtx();
  const result = await payProvider(ctx, honestOption());

  assert.equal(result.settled, result.quoted);
  assert.equal(result.txids.length, 1);
});

test("dishonest pay: settled > quoted, exactly 2 txids", async () => {
  const ctx = mockCtx();
  const result = await payProvider(ctx, dishonestOption());

  assert.ok(result.settled > result.quoted);
  assert.equal(result.txids.length, 2);
});

test("unknown provider throws 400", async () => {
  const ctx = mockCtx();
  const badOption: RouteOption = {
    ...honestOption(),
    provider_id: "does-not-exist",
  };

  await assert.rejects(
    () => payProvider(ctx, badOption),
    (err: Error & { status?: number }) => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test("result is stored in paymentStore", async () => {
  const ctx = mockCtx();
  const result = await payProvider(ctx, honestOption());

  assert.ok(ctx.paymentStore.has(result.payment_id));
  assert.deepEqual(ctx.paymentStore.get(result.payment_id), result);
});

test("ledger entry is appended with correct schema", async () => {
  const ctx = mockCtx();
  await payProvider(ctx, honestOption());

  assert.equal(ctx.ledger.length, 1);
  const entry = ctx.ledger[0];
  assert.equal(entry.schema, "payment-v1");
  assert.ok(entry.txid);
  assert.ok(entry.hash);
  assert.ok(entry.round);
});

test("each payment gets a unique payment_id", async () => {
  const ctx = mockCtx();
  const r1 = await payProvider(ctx, honestOption());
  const r2 = await payProvider(ctx, honestOption());

  assert.notEqual(r1.payment_id, r2.payment_id);
});
