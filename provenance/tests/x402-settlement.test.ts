// x402 verify + settle (Berlin AlgoHack) — Payer/Facilitator split, matching the official
// algorandfoundation/x402-demo two-phase facilitator.
//
// A payment counts only if it goes to the right wallet, in the right amount, in the right asset,
// bound to the right resource, and settles once. Each test pins one failure mode.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MockFacilitator, MockPayer } from "../src/x402/facilitator.ts";
import { type PaymentRequirements, networkId } from "../src/x402/types.ts";

const clock = () => "2026-06-06T10:00:00.000Z";

function req(over: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: networkId("mock"),
    amount: 10_000,
    asset: "ALGO",
    resource: "read:Analyst:t1",
    description: "Analyst read of task t1",
    mimeType: "application/json",
    payTo: "ANALYSTWALLET",
    nonce: "n-1",
    maxTimeoutSeconds: 60,
    ...over,
  };
}

test("happy path: sign → verify → settle succeeds", async () => {
  const payer = new MockPayer();
  const fac = new MockFacilitator(clock);
  const r = req();
  const payment = await payer.createPayment(r);

  const v = await fac.verify(payment, r);
  assert.equal(v.isValid, true);
  assert.equal(v.payer, payer.address);

  const s = await fac.settle(payment, r);
  assert.equal(s.success, true);
  assert.ok(s.transaction);
  assert.equal(s.settledAt, "2026-06-06T10:00:00.000Z");
  assert.ok(s.confirmedRound && s.confirmedRound > 0);
});

test("underpayment is rejected at both verify and settle", async () => {
  const payer = new MockPayer();
  const fac = new MockFacilitator(clock);
  const payment = await payer.createPayment(req({ amount: 1 })); // signs for 1 unit
  const v = await fac.verify(payment, req()); // server requires 10,000
  assert.equal(v.isValid, false);
  assert.match(v.invalidReason ?? "", /underpayment/);
  const s = await fac.settle(payment, req());
  assert.equal(s.success, false);
  assert.match(s.errorReason ?? "", /underpayment/);
});

test("payment to the wrong receiver is rejected", async () => {
  const fac = new MockFacilitator(clock);
  const payment = await new MockPayer().createPayment(req({ payTo: "ATTACKERWALLET" }));
  const s = await fac.settle(payment, req()); // server expects ANALYSTWALLET
  assert.equal(s.success, false);
  assert.match(s.errorReason ?? "", /wrong receiver/);
});

test("payment in the wrong asset is rejected", async () => {
  const fac = new MockFacilitator(clock);
  const payment = await new MockPayer().createPayment(req({ asset: 10458941 })); // an ASA, not ALGO
  const s = await fac.settle(payment, req());
  assert.equal(s.success, false);
  assert.match(s.errorReason ?? "", /wrong asset/);
});

test("a payment bound to a different resource is rejected", async () => {
  const fac = new MockFacilitator(clock);
  const payment = await new MockPayer().createPayment(req({ resource: "read:Analyst:SOME_OTHER_TASK" }));
  const s = await fac.settle(payment, req()); // server is selling read:Analyst:t1
  assert.equal(s.success, false);
  assert.match(s.errorReason ?? "", /binding mismatch/);
});

test("replay: settling the same authorization twice is rejected", async () => {
  const fac = new MockFacilitator(clock);
  const payment = await new MockPayer().createPayment(req());
  const first = await fac.settle(payment, req());
  assert.equal(first.success, true);
  const second = await fac.settle(payment, req());
  assert.equal(second.success, false);
  assert.match(second.errorReason ?? "", /replay/);
});

test("a malformed authorization cannot be settled", async () => {
  const fac = new MockFacilitator(clock);
  const s = await fac.settle(
    { x402Version: 2, scheme: "exact", network: networkId("mock"), payload: { payer: "X", authorization: "!!!not-base64-json!!!" } },
    req(),
  );
  assert.equal(s.success, false);
  assert.match(s.errorReason ?? "", /malformed authorization/);
});
