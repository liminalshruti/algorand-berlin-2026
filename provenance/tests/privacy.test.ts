// Privacy fence (Berlin AlgoHack OKR "guarantee hash-only on-chain; no raw context, correction,
// or agent output leaks").
//
// These tests assert the structural property the whole sovereignty pitch depends on: anchoring a
// packet publishes the hash and nothing else. They inspect the RAW note bytes the chain would
// hold — not a friendly object — so they catch any path that would smuggle content on chain.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAnchorChain, Vault, NOTE_SCHEMA, type Packet } from "../src/index.ts";

const SECRET_CONTEXT = "ACQUISITION-TALKS-WITH-ACME-AT-40M";
const SECRET_CORRECTION = "DO-NOT-DISCLOSE-board-is-split-3-2";
const SECRET_SITUATION = "CONFIDENTIAL-runway-is-7-weeks";

function secretPacket(): Packet {
  return {
    id: "pkt_secret",
    context: SECRET_CONTEXT,
    user_correction: SECRET_CORRECTION,
    chosen_agent: "Auditor",
    correction_kind: "inner",
    runtime_mode: "live",
    created_at: "2026-05-08T00:00:00.000Z",
    agent_reads: [
      { agent_name: "Analyst", archetype: "Diligence", situation: SECRET_SITUATION, hidden_risk: "x", next_move: "y", refusal: null, ordinal: 0 },
    ],
  };
}

test("on-chain note contains only {schema, canonical_version, packet_hash}", async () => {
  const chain = new MockAnchorChain();
  const vault = new Vault();
  const p = secretPacket();
  vault.save(p);
  const receipt = await vault.anchorPacket(p.id, chain);

  const raw = chain.rawNote(receipt.anchor_txn_id);
  assert.ok(raw, "note bytes should exist");
  const note = JSON.parse(new TextDecoder().decode(raw!));
  assert.deepEqual(Object.keys(note).sort(), ["canonical_version", "packet_hash", "schema"]);
  assert.equal(note.schema, NOTE_SCHEMA);
  assert.match(note.packet_hash, /^[0-9a-f]{64}$/);
});

test("no secret content appears anywhere in the on-chain note bytes", async () => {
  const chain = new MockAnchorChain();
  const vault = new Vault();
  const p = secretPacket();
  vault.save(p);
  const receipt = await vault.anchorPacket(p.id, chain);

  const noteText = new TextDecoder().decode(chain.rawNote(receipt.anchor_txn_id)!);
  for (const secret of [SECRET_CONTEXT, SECRET_CORRECTION, SECRET_SITUATION]) {
    assert.ok(!noteText.includes(secret), `note leaked: ${secret}`);
  }
});

test("the stored receipt carries no raw content fields", async () => {
  const chain = new MockAnchorChain();
  const vault = new Vault();
  const p = secretPacket();
  vault.save(p);
  const receipt = await vault.anchorPacket(p.id, chain);

  const receiptText = JSON.stringify(receipt);
  for (const secret of [SECRET_CONTEXT, SECRET_CORRECTION, SECRET_SITUATION]) {
    assert.ok(!receiptText.includes(secret), `receipt leaked: ${secret}`);
  }
  // Receipt field set is exactly the Berlin DACI set.
  assert.deepEqual(
    Object.keys(receipt).sort(),
    ["anchor_txn_id", "anchored_at", "canonical_version", "chain", "network", "packet_hash", "verifier"],
  );
});

test("note size is bounded and independent of packet size (hash leaks no length signal)", async () => {
  const chain = new MockAnchorChain();
  const vault = new Vault();

  const small = secretPacket();
  small.id = "pkt_small";
  vault.save(small);
  const rSmall = await vault.anchorPacket(small.id, chain);

  const big = secretPacket();
  big.id = "pkt_big";
  big.context = "X".repeat(100_000); // 100 KB of content
  vault.save(big);
  const rBig = await vault.anchorPacket(big.id, chain);

  const sizeSmall = chain.rawNote(rSmall.anchor_txn_id)!.byteLength;
  const sizeBig = chain.rawNote(rBig.anchor_txn_id)!.byteLength;
  assert.equal(sizeSmall, sizeBig, "note size must not vary with packet content size");
  assert.ok(sizeBig < 256, "note must stay well within Algorand's 1KB note limit");
});
