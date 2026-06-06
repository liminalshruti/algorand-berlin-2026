// Hash stability (Berlin AlgoHack OKR "tests for hash stability").
//
// The whole provenance claim rests on this: the same logical packet must always hash to the same
// value, and a different packet must hash to a different value. If serialization drifts, every
// past anchor silently becomes unverifiable — so these are the load-bearing tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signPacket, type Packet } from "../src/index.ts";

function basePacket(): Packet {
  return {
    id: "pkt_1",
    context: "context body",
    user_correction: "the correction",
    chosen_agent: "Auditor",
    correction_kind: "outer",
    runtime_mode: "live",
    created_at: "2026-05-08T17:42:00.000Z",
    agent_reads: [
      { agent_name: "Analyst", archetype: "Diligence", situation: "s0", hidden_risk: "r0", next_move: "m0", refusal: null, ordinal: 0 },
      { agent_name: "Auditor", archetype: "Dissent", situation: "s1", hidden_risk: null, next_move: "m1", refusal: "no", ordinal: 1 },
    ],
  };
}

test("golden vector: a fixed packet hashes to a pinned value", () => {
  // Pin the hash. Any change to the canonical algorithm or domain tag breaks this on purpose —
  // that is the alarm that a serialization change would invalidate every existing anchor.
  const { packet_hash, canonical_version } = signPacket(basePacket());
  assert.equal(canonical_version, "1");
  assert.equal(packet_hash, "3cf12778b84631a0dbb8106ac01b4bb302543ff77fe08aa003ef91717790e937");
});

test("key insertion order does not change the hash", () => {
  const a = basePacket();
  // Rebuild the same packet with members declared in a different order.
  const b: Packet = {
    agent_reads: a.agent_reads,
    created_at: a.created_at,
    runtime_mode: a.runtime_mode,
    correction_kind: a.correction_kind,
    chosen_agent: a.chosen_agent,
    user_correction: a.user_correction,
    context: a.context,
    id: a.id,
  };
  assert.equal(signPacket(a).packet_hash, signPacket(b).packet_hash);
});

test("agent_reads array order does not change the hash (sorted by ordinal)", () => {
  const a = basePacket();
  const b = basePacket();
  b.agent_reads = [a.agent_reads[1]!, a.agent_reads[0]!]; // reversed
  assert.equal(signPacket(a).packet_hash, signPacket(b).packet_hash);
});

test("Unicode NFC/NFD forms of the same text hash identically", () => {
  const a = basePacket();
  const b = basePacket();
  a.context = "café"; // composed (NFC)
  b.context = "café"; // decomposed (NFD) — same grapheme
  assert.notEqual(a.context, b.context); // different code units in memory...
  assert.equal(signPacket(a).packet_hash, signPacket(b).packet_hash); // ...same canonical hash
});

test("fields outside the canonical allowlist cannot affect the hash", () => {
  const a = basePacket();
  // A UI-only / incidental property sneaks onto the object.
  const polluted = { ...a, _ui_selected: true, draft_note: "scratch" } as unknown as Packet;
  assert.equal(signPacket(a).packet_hash, signPacket(polluted).packet_hash);
});

test("changing real content changes the hash", () => {
  const a = basePacket();
  const b = basePacket();
  b.context = a.context + "!";
  assert.notEqual(signPacket(a).packet_hash, signPacket(b).packet_hash);
});

test("null vs missing optional is normalized (explicit null == undefined member)", () => {
  const a = basePacket();
  a.user_correction = null;
  const b = basePacket();
  // @ts-expect-error — modeling a row where the optional was never set
  b.user_correction = undefined;
  assert.equal(signPacket(a).packet_hash, signPacket(b).packet_hash);
});

test("hash is a 64-char lowercase hex SHA-256 digest", () => {
  assert.match(signPacket(basePacket()).packet_hash, /^[0-9a-f]{64}$/);
});
