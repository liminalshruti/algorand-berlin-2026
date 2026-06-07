import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "./validation.js";
import type { PaymentResult } from "./contract.js";

function pay(quoted: number, settled: number): PaymentResult {
  return {
    payment_id: "p1",
    agent_id: "agent-1",
    quote_id: "quote-1",
    quoted,
    settled,
    txids: ["tx1"],
    read: "ok",
  };
}

test("settled == quoted -> full pass, response 100", () => {
  const v = validate(pay(0.1, 0.1));
  assert.equal(v.price_match, true);
  assert.equal(v.output_pass, null);
  assert.equal(v.response, 100);
});

test("settled > quoted -> price mismatch, response 0", () => {
  const v = validate(pay(0.04, 0.06));
  assert.equal(v.price_match, false);
  assert.equal(v.output_pass, null);
  assert.equal(v.response, 0);
});

test("floating-point equality within epsilon counts as a match", () => {
  const settled = 0.1 + 0.2 - 0.2;
  const v = validate(pay(0.1, settled));
  assert.equal(v.price_match, true);
  assert.equal(v.response, 100);
});
