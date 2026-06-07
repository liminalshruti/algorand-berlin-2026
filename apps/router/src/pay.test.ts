import { test } from "node:test";
import assert from "node:assert/strict";
import { payAgent } from "./pay.js";
import type { ActiveQuote, Agent, Ctx, PaymentRequirement, RouteOption } from "./contract.js";

let txCounter = 0;

function mockSettle(): Ctx["deps"]["settle"] {
  return async () => ({
    txid: `mock-txid-${++txCounter}`,
    round: 1000 + txCounter,
  });
}

const honestAgent: Agent = {
  id: "agent-honest",
  name: "Honest Co",
  agent_wallet: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  agent_uri: "https://agents.local/honest",
};

const cheatAgent: Agent = {
  id: "agent-cheat",
  name: "Cheat Co",
  agent_wallet: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  agent_uri: "https://agents.local/cheat",
};

function quote(agent_id: string, quote_id: string, amount: number): ActiveQuote {
  return {
    quote_id,
    agent_id,
    service_id: "diligence.report",
    amount,
    asset: "ALGO",
    pay_to: agent_id === "agent-honest" ? honestAgent.agent_wallet : cheatAgent.agent_wallet,
    observed_at: "2026-06-07T00:00:00.000Z",
    expires_at: "2026-06-07T00:05:00.000Z",
  };
}

function requirement(quote_id: string, amount: number, pay_to: string): PaymentRequirement {
  return { quote_id, amount, asset: "ALGO", pay_to };
}

function mockCtx(overrides: Partial<Ctx> = {}): Ctx {
  const qHonest = quote("agent-honest", "quote-honest", 0.1);
  const qCheat = quote("agent-cheat", "quote-cheat", 0.04);
  return {
    net: "localnet",
    store: null,
    session: {
      payer: { addr: "PAYER", sk: new Uint8Array(64) },
      facilitator: { addr: "FAC", sk: new Uint8Array(64) },
      funded: { addr: "PAYER", sk: new Uint8Array(64) },
    },
    agents: new Map([
      [honestAgent.id, honestAgent],
      [cheatAgent.id, cheatAgent],
    ]),
    services: [],
    activeQuotes: new Map([
      [qHonest.quote_id, qHonest],
      [qCheat.quote_id, qCheat],
    ]),
    paymentRequirements: new Map([
      [qHonest.quote_id, requirement(qHonest.quote_id, 0.1, honestAgent.agent_wallet)],
      [qCheat.quote_id, requirement(qCheat.quote_id, 0.06, cheatAgent.agent_wallet)],
    ]),
    routeStore: new Map(),
    paymentStore: new Map(),
    repState: { getReputation: () => null },
    ledger: [],
    deps: {
      settle: mockSettle(),
      anchorNote: async () => ({
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

function option(agent_id = "agent-honest", quote_id = "quote-honest", price = 0.1): RouteOption {
  return {
    option_id: `opt-${agent_id}`,
    agent_id,
    service_id: "diligence.report",
    quote_id,
    name: agent_id,
    price,
    asset: "ALGO",
    pay_to: agent_id === "agent-honest" ? honestAgent.agent_wallet : cheatAgent.agent_wallet,
    reputation: 80,
    trust_score: 75,
  };
}

test("honest agent pay: settled == quoted", async () => {
  const ctx = mockCtx();
  const result = await payAgent(ctx, option());

  assert.equal(result.settled, result.quoted);
  assert.equal(result.txids.length, 1);
});

test("quote drift pay: observed x402 amount settles above quoted amount", async () => {
  const ctx = mockCtx();
  const result = await payAgent(ctx, option("agent-cheat", "quote-cheat", 0.04));

  assert.ok(result.settled > result.quoted);
  assert.equal(result.settled, 0.06);
  assert.equal(result.txids.length, 1);
});

test("unknown agent throws 400", async () => {
  const ctx = mockCtx();
  await assert.rejects(
    () => payAgent(ctx, option("does-not-exist", "quote-honest")),
    (err: Error & { status?: number }) => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test("unknown quote throws 400", async () => {
  const ctx = mockCtx();
  await assert.rejects(
    () => payAgent(ctx, option("agent-honest", "missing-quote")),
    (err: Error & { status?: number }) => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test("result is stored in paymentStore with agent_id and quote_id", async () => {
  const ctx = mockCtx();
  const result = await payAgent(ctx, option());

  assert.ok(ctx.paymentStore.has(result.payment_id));
  assert.deepEqual(ctx.paymentStore.get(result.payment_id), result);
  assert.equal(result.agent_id, "agent-honest");
  assert.equal(result.quote_id, "quote-honest");
});

test("ledger entry is appended with correct schema", async () => {
  const ctx = mockCtx();
  await payAgent(ctx, option());

  assert.equal(ctx.ledger.length, 1);
  const entry = ctx.ledger[0];
  assert.equal(entry.schema, "payment-v1");
  assert.ok(entry.txid);
  assert.ok(entry.hash);
  assert.ok(entry.round);
});

test("each payment gets a unique payment_id", async () => {
  const ctx = mockCtx();
  const r1 = await payAgent(ctx, option());
  const r2 = await payAgent(ctx, option());

  assert.notEqual(r1.payment_id, r2.payment_id);
});
