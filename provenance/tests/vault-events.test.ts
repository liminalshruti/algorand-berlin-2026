// Append-only event log — the vault records save/anchor as hash-only events (Berlin AlgoHack).
//
// The event log is the audit substrate the correction stream, the per-call audit wrapper, and the
// refusal record all write through. Two invariants carry the most weight: events carry hashes and
// typed metadata, NEVER content (the same privacy fence that holds on chain), and anchoring stays
// idempotent — a re-anchor records nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vault } from "../src/vault.ts";
import { MockAnchorChain } from "../src/chain/mock.ts";
import { signPacket, type Packet } from "../src/index.ts";

const clock = () => "2026-06-06T10:00:00.000Z";

function secretPacket(id = "pkt_secret"): Packet {
  return {
    id,
    context: "SECRET-CONTEXT-DO-NOT-LEAK",
    user_correction: "SECRET-CORRECTION-DO-NOT-LEAK",
    chosen_agent: "Analyst",
    correction_kind: "outer",
    runtime_mode: "demo",
    created_at: "2026-06-06T09:00:00.000Z",
    agent_reads: [
      { agent_name: "Analyst", archetype: "Diligence", situation: "SECRET-SITUATION", hidden_risk: null, next_move: null, refusal: null, ordinal: 0 },
    ],
  };
}

test("save emits exactly one packet.saved event carrying only the hash", () => {
  const vault = new Vault(clock);
  const pkt = secretPacket();
  vault.save(pkt);

  const saved = vault.list("packet.saved");
  assert.equal(saved.length, 1);
  assert.equal(vault.count("packet.saved"), 1);

  const payload = saved[0]!.payload as { packet_id: string; packet_hash: string };
  assert.equal(payload.packet_id, pkt.id);
  assert.equal(payload.packet_hash, signPacket(pkt).packet_hash);
  assert.equal(saved[0]!.createdAt, "2026-06-06T10:00:00.000Z"); // injected clock
});

test("no packet content leaks into the event log", () => {
  const vault = new Vault(clock);
  vault.save(secretPacket());
  const dump = JSON.stringify(vault.list());
  for (const secret of ["SECRET-CONTEXT", "SECRET-CORRECTION", "SECRET-SITUATION"]) {
    assert.equal(dump.includes(secret), false, `event log leaked "${secret}"`);
  }
});

test("anchorPacket emits packet.anchored once; the idempotent re-anchor emits nothing", async () => {
  const vault = new Vault(clock);
  const anchor = new MockAnchorChain(clock);
  const pkt = secretPacket("pkt_anchor");
  vault.save(pkt);

  await vault.anchorPacket(pkt.id, anchor);
  assert.equal(vault.count("packet.anchored"), 1);

  // Anchoring is idempotent at the vault layer — a second call returns the same receipt
  // and records NO second event.
  await vault.anchorPacket(pkt.id, anchor);
  assert.equal(vault.count("packet.anchored"), 1);

  const payload = vault.list("packet.anchored")[0]!.payload as {
    packet_id: string;
    packet_hash: string;
    anchor_txn_id: string;
  };
  assert.equal(payload.packet_id, pkt.id);
  assert.equal(payload.packet_hash, signPacket(pkt).packet_hash);
  assert.match(payload.anchor_txn_id, /^[A-Z2-7]{52}$/); // Algorand-shaped txid
});

test("write/list/count: events are returned in insertion order and filter by kind", () => {
  const vault = new Vault(clock);
  vault.write("agent.call", { decision_tag: "serve_priced_read" });
  vault.write("correction", { correction_kind: "outer" });
  vault.write("agent.call", { decision_tag: "settle_payment" });

  assert.equal(vault.count(), 3);
  assert.equal(vault.count("agent.call"), 2);
  assert.equal(vault.count("correction"), 1);

  assert.deepEqual(vault.list().map((e) => e.kind), ["agent.call", "correction", "agent.call"]);

  // list() returns a copy — mutating it does not affect the vault.
  const copy = vault.list();
  copy.pop();
  assert.equal(vault.count(), 3);
});
