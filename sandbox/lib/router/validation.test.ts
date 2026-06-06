import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "./validation.js";
import type { PaymentResult, Provider } from "./contract.js";

// ---- helpers ----
function pay(quoted: number, settled: number): PaymentResult {
  return { payment_id: "p1", provider_id: "prov-1", quoted, settled, txids: ["tx1"], read: "ok" };
}
function provider(quality: number): Provider {
  return {
    id: "prov-1", name: "Agent", register: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    quote: 0.1, asset: "ALGO", quality, dishonest: false, agent_uri: "https://a",
  };
}

// ---- price-vs-quote ----
test("honest provider (settled == quoted, high quality) → full pass, response 100", () => {
  const v = validate(pay(0.1, 0.1), provider(0.9));
  assert.equal(v.price_match, true);
  assert.equal(v.output_pass, true);
  assert.equal(v.response, 100);
});

test("cheat provider (settled > quoted) → price mismatch, response 0 regardless of quality", () => {
  const v = validate(pay(0.04, 0.06), provider(0.99));
  assert.equal(v.price_match, false);
  assert.equal(v.response, 0);
});

test("price matches but quality below threshold → partial 60", () => {
  const v = validate(pay(0.1, 0.1), provider(0.5));
  assert.equal(v.price_match, true);
  assert.equal(v.output_pass, false);
  assert.equal(v.response, 60);
});

test("quality exactly at threshold (0.6) passes", () => {
  const v = validate(pay(0.1, 0.1), provider(0.6));
  assert.equal(v.output_pass, true);
  assert.equal(v.response, 100);
});

test("unknown provider → output_pass null, response follows price only", () => {
  const v = validate(pay(0.1, 0.1), undefined);
  assert.equal(v.output_pass, null);
  assert.equal(v.response, 100);
});

test("unknown provider with price mismatch → response 0", () => {
  const v = validate(pay(0.04, 0.06), undefined);
  assert.equal(v.price_match, false);
  assert.equal(v.response, 0);
});

test("floating-point equality within epsilon counts as a match", () => {
  // 0.1 + 0.2 - 0.2 !== 0.1 exactly; the 1e-9 epsilon must absorb it.
  const settled = 0.1 + 0.2 - 0.2;
  const v = validate(pay(0.1, settled), provider(0.9));
  assert.equal(v.price_match, true);
  assert.equal(v.response, 100);
});
