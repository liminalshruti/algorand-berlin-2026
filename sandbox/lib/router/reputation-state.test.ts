import { test } from "node:test";
import assert from "node:assert/strict";
import { createRepState } from "./reputation-state.js";
import type { ValidationResult } from "./validation.js";

// ---- helpers: the three verdict shapes the validator produces ----
const PASS: ValidationResult = { price_match: true, output_pass: true, response: 100 };
const PRICE_MISS: ValidationResult = { price_match: false, output_pass: null, response: 0 };
const QUALITY_DRIFT: ValidationResult = { price_match: true, output_pass: false, response: 60 };

test("no history → getReputation and full return null", () => {
  const rep = createRepState();
  assert.equal(rep.getReputation("x"), null);
  assert.equal(rep.full("x"), null);
});

test("a clean read → score 100, no corrections, empty tags", () => {
  const rep = createRepState();
  const out = rep.writeBack("a", PASS);
  assert.equal(out.score, 100);
  assert.equal(out.reads_logged, 1);
  assert.equal(out.corrections_logged, 0);
  assert.deepEqual(out.by_tag, {});
});

test("price mismatch → corrected, score 0, tagged missed_compensation", () => {
  const rep = createRepState();
  const out = rep.writeBack("a", PRICE_MISS);
  assert.equal(out.score, 0);
  assert.equal(out.corrections_logged, 1);
  assert.deepEqual(out.by_tag, { missed_compensation: 1 });
});

test("quality drift (price matched) → corrected, tagged quality_drift", () => {
  const rep = createRepState();
  const out = rep.writeBack("a", QUALITY_DRIFT);
  assert.equal(out.corrections_logged, 1);
  assert.deepEqual(out.by_tag, { quality_drift: 1 });
});

test("score = round(100*(reads-corrections)/reads) across mixed history", () => {
  const rep = createRepState();
  rep.writeBack("a", PASS);
  rep.writeBack("a", PASS);
  rep.writeBack("a", PASS);
  const out = rep.writeBack("a", PRICE_MISS); // 4 reads, 1 correction → 75
  assert.equal(out.reads_logged, 4);
  assert.equal(out.corrections_logged, 1);
  assert.equal(out.score, 75);
});

test("write-back is visible to ranking via getReputation (the reroute hook)", () => {
  const rep = createRepState();
  rep.writeBack("caught", PRICE_MISS);
  const r = rep.getReputation("caught");
  assert.notEqual(r, null);
  assert.equal(r!.score, 0); // ranking drops a 0-score provider on re-run
});

test("tags accumulate per provider", () => {
  const rep = createRepState();
  rep.writeBack("a", PRICE_MISS);
  rep.writeBack("a", PRICE_MISS);
  const out = rep.writeBack("a", QUALITY_DRIFT);
  assert.deepEqual(out.by_tag, { missed_compensation: 2, quality_drift: 1 });
});

test("per-provider isolation: one provider's history doesn't bleed into another", () => {
  const rep = createRepState();
  rep.writeBack("a", PASS);
  rep.writeBack("b", PRICE_MISS);
  assert.equal(rep.getReputation("a")!.score, 100);
  assert.equal(rep.getReputation("b")!.score, 0);
});
