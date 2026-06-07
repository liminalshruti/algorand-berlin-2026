import { test } from "node:test";
import assert from "node:assert/strict";
import { createRepState } from "./reputation-state.js";
import type { ValidationResult } from "./validation.js";

// ---- helpers: the verdict shapes the validator produces ----
const PASS: ValidationResult = { price_match: true, output_pass: null, response: 100 };
const PRICE_MISS: ValidationResult = { price_match: false, output_pass: null, response: 0 };

test("no history -> getReputation and full return null", () => {
  const rep = createRepState();
  assert.equal(rep.getReputation("x"), null);
  assert.equal(rep.full("x"), null);
});

test("a clean read -> effective score rises above the prior, no corrections, empty tags", () => {
  const rep = createRepState();
  const out = rep.writeBack("a", PASS);
  assert.equal(out.score, 70);
  assert.equal(out.reads_logged, 1);
  assert.equal(out.corrections_logged, 0);
  assert.deepEqual(out.by_tag, {});
});

test("price mismatch -> corrected, effective score drops without one-event death", () => {
  const rep = createRepState();
  const out = rep.writeBack("a", PRICE_MISS);
  assert.equal(out.score, 45);
  assert.equal(out.corrections_logged, 1);
  assert.deepEqual(out.by_tag, { missed_compensation: 1 });
});

test("score blends prior with observed clean reads across mixed history", () => {
  const rep = createRepState();
  rep.writeBack("a", PASS);
  rep.writeBack("a", PASS);
  rep.writeBack("a", PASS);
  const out = rep.writeBack("a", PRICE_MISS); // prior 60 weight 3 + observed 3/4 clean -> 69
  assert.equal(out.reads_logged, 4);
  assert.equal(out.corrections_logged, 1);
  assert.equal(out.score, 69);
});

test("write-back is visible to ranking via getReputation without killing sparse agents", () => {
  const rep = createRepState();
  rep.writeBack("caught", PRICE_MISS);
  const r = rep.getReputation("caught");
  assert.notEqual(r, null);
  assert.equal(r!.score, 45);
});

test("tags accumulate per agent", () => {
  const rep = createRepState();
  rep.writeBack("a", PRICE_MISS);
  const out = rep.writeBack("a", PRICE_MISS);
  assert.deepEqual(out.by_tag, { missed_compensation: 2 });
});

test("per-agent isolation: one agent's history doesn't bleed into another", () => {
  const rep = createRepState();
  rep.writeBack("a", PASS);
  rep.writeBack("b", PRICE_MISS);
  assert.equal(rep.getReputation("a")!.score, 70);
  assert.equal(rep.getReputation("b")!.score, 45);
});
