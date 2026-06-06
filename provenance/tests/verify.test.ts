// Verification flow (Berlin AlgoHack OKRs "verification flow" + "verifier utility" + the
// sign→anchor→verify demo path).

import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAnchorChain, Vault, verifyPacket, type Clock, type Packet } from "../src/index.ts";

const fixedClock: Clock = () => "2026-06-06T09:00:00.000Z";

function packet(): Packet {
  return {
    id: "pkt_verify",
    context: "ship-decision context",
    user_correction: "hold and verify",
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

test("happy path: sign → anchor → verify succeeds", async () => {
  const chain = new MockAnchorChain(fixedClock);
  const vault = new Vault();
  const p = packet();
  vault.save(p);
  const receipt = await vault.anchorPacket(p.id, chain);

  const shared = vault.sharePacket(p.id)!;
  const result = await verifyPacket(shared, receipt.anchor_txn_id, chain);

  assert.equal(result.ok, true);
  assert.equal(result.on_chain_hash, receipt.packet_hash);
  assert.equal(result.recomputed_hash, receipt.packet_hash);
  assert.equal(result.on_chain_version, "1");
  assert.equal(result.anchored_at, "2026-06-06T09:00:00.000Z");
});

test("tamper: a one-character change to the shared packet is rejected", async () => {
  const chain = new MockAnchorChain(fixedClock);
  const vault = new Vault();
  const p = packet();
  vault.save(p);
  const receipt = await vault.anchorPacket(p.id, chain);

  const tampered: Packet = { ...vault.sharePacket(p.id)!, context: "ship-decision context " };
  const result = await verifyPacket(tampered, receipt.anchor_txn_id, chain);

  assert.equal(result.ok, false);
  assert.notEqual(result.recomputed_hash, result.on_chain_hash);
  assert.match(result.reason, /mismatch/);
});

test("unknown txn id verifies as not-found, not as success", async () => {
  const chain = new MockAnchorChain(fixedClock);
  const result = await verifyPacket(packet(), "NONEXISTENTTXIDNONEXISTENTTXIDNONEXISTENTTXIDNONEXIS", chain);
  assert.equal(result.ok, false);
  assert.equal(result.on_chain_hash, null);
  assert.match(result.reason, /no anchor found/);
});

test("verifier needs only the packet, the txn id, and chain read access — no vault", async () => {
  // Anchor with one vault, then verify with a totally independent context that never saw the vault.
  const chain = new MockAnchorChain(fixedClock);
  const vault = new Vault();
  const p = packet();
  vault.save(p);
  const receipt = await vault.anchorPacket(p.id, chain);

  // Reconstruct the shared packet from bytes a founder might paste into an email — not from vault.
  const sharedFromWire: Packet = JSON.parse(JSON.stringify(p));
  const result = await verifyPacket(sharedFromWire, receipt.anchor_txn_id, chain);
  assert.equal(result.ok, true);
});

test("anchoring is idempotent at the vault layer", async () => {
  const chain = new MockAnchorChain(fixedClock);
  const vault = new Vault();
  const p = packet();
  vault.save(p);
  const first = await vault.anchorPacket(p.id, chain);
  const second = await vault.anchorPacket(p.id, chain);
  assert.equal(first.anchor_txn_id, second.anchor_txn_id);
});
