// x402 structural guard + gate (Berlin AlgoHack).
//
// The commerce-rogue prevention the Berlin pitch promises: an agent serves and charges only for
// in-lane work; out-of-lane work is refused for free, naming the correct agent — so no payment
// can ever change hands for work an agent has no business doing. Paid in-lane work runs the
// official verify→settle two-phase and then anchors (settlement + provenance on one substrate).

import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRegistry, type PricedAgent, type Task } from "../src/x402/agent.ts";
import { MockFacilitator, MockPayer } from "../src/x402/facilitator.ts";
import { MockAnchorChain } from "../src/chain/mock.ts";
import { Vault } from "../src/vault.ts";
import { verifyPacket } from "../src/verify.ts";
import { PricedEndpoint, x402Exchange } from "../src/x402/gate.ts";

const clock = () => "2026-06-06T10:00:00.000Z";

function fixture() {
  const analyst: PricedAgent = {
    name: "Analyst",
    register: "Diligence",
    archetype: "Diligence",
    payTo: "ANALYSTWALLET",
    price: 10_000,
    asset: "ALGO",
    serve: (t) => ({ agent_name: "Analyst", archetype: "Diligence", situation: `read:${t.prompt}`, hidden_risk: null, next_move: "diff", refusal: null, ordinal: 0 }),
  };
  const sdr: PricedAgent = {
    name: "SDR",
    register: "Outreach",
    archetype: "Outreach",
    payTo: "SDRWALLET",
    price: 5_000,
    asset: "ALGO",
    serve: (t) => ({ agent_name: "SDR", archetype: "Outreach", situation: `draft:${t.prompt}`, hidden_risk: null, next_move: "send", refusal: null, ordinal: 0 }),
  };
  const registry = new AgentRegistry().add(analyst).add(sdr);
  return { analyst, sdr, registry, payer: new MockPayer(), facilitator: new MockFacilitator(clock) };
}

test("out-of-lane work is refused for free, names the right agent, and never settles", async () => {
  const { analyst, registry, payer, facilitator } = fixture();
  const endpoint = new PricedEndpoint(analyst, facilitator, registry, { clock });

  const task: Task = { id: "t", register: "Outreach", prompt: "write the follow-up email" };
  const res = await x402Exchange(endpoint, task, payer);

  assert.equal(res.status, 200);
  assert.equal(res.outcome, "refused-free");
  if (res.outcome === "refused-free") {
    assert.equal(res.referTo, "SDR"); // names the correct agent
    assert.match(res.refusal, /outside the Diligence/i);
  }
});

test("in-lane work returns 402 PAYMENT-REQUIRED before it will serve", async () => {
  const { analyst, registry, facilitator } = fixture();
  const endpoint = new PricedEndpoint(analyst, facilitator, registry, { clock });

  const task: Task = { id: "t", register: "Diligence", prompt: "diff state" };
  const first = await endpoint.serve(task);
  assert.equal(first.status, 402);
  assert.equal(first.outcome, "payment-required");
  if (first.outcome === "payment-required") {
    assert.equal(first.requirements.scheme, "exact");
    assert.equal(first.requirements.amount, 10_000);
    assert.equal(first.requirements.payTo, "ANALYSTWALLET");
  }
});

test("paid in-lane work settles, serves, and anchors — paid here, proven here", async () => {
  const { analyst, registry, payer } = fixture();
  const facilitator = new MockFacilitator(clock);
  const anchor = new MockAnchorChain(clock);
  const vault = new Vault();
  const endpoint = new PricedEndpoint(analyst, facilitator, registry, { vault, anchorChain: anchor, clock });

  const task: Task = { id: "t", register: "Diligence", prompt: "diff state" };
  const res = await x402Exchange(endpoint, task, payer);

  assert.equal(res.outcome, "paid");
  if (res.outcome === "paid") {
    assert.equal(res.settlement.success, true);
    assert.equal(res.read.agent_name, "Analyst");
    assert.ok(res.anchor, "delivered packet should be anchored");

    // The buyer can independently verify the delivered packet against the anchor — no vault access.
    const shared = vault.sharePacket("pkt_t_Analyst");
    assert.ok(shared);
    const v = await verifyPacket(shared!, res.anchor!.anchor_txn_id, anchor);
    assert.equal(v.ok, true);
  }
});

test("a payment for a challenge the endpoint never issued is rejected", async () => {
  const { analyst, registry, payer, facilitator } = fixture();
  const endpoint = new PricedEndpoint(analyst, facilitator, registry, { clock });

  const task: Task = { id: "t", register: "Diligence", prompt: "diff state" };
  // Sign a payment against a forged challenge the endpoint never issued.
  const forged = await payer.createPayment({
    scheme: "exact",
    network: facilitator.network,
    amount: 10_000,
    asset: "ALGO",
    resource: "read:Analyst:t",
    description: "forged",
    mimeType: "application/json",
    payTo: "ANALYSTWALLET",
    nonce: "forged-nonce",
    maxTimeoutSeconds: 60,
  });
  const res = await endpoint.serve(task, forged);
  assert.equal(res.status, 402);
  assert.equal(res.outcome, "payment-invalid");
  if (res.outcome === "payment-invalid") assert.match(res.reason, /unknown or expired/);
});
