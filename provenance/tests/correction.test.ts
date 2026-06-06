// Correction stream — first-class user pushback, emergence stays local (PPA #5 substrate).
//
// The signature Liminal primitive: a correction is recorded as first-class vault data that changes
// the next read (the loop does not converge), and an `emergence` correction — the highest-value
// third the system did not offer — is recorded but NEVER projected outward.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vault } from "../src/vault.ts";
import { MockAnchorChain } from "../src/chain/mock.ts";
import { recordCorrection, projectCorrections, type Packet } from "../src/index.ts";

const clock = () => "2026-06-06T10:00:00.000Z";
const provenance = { source: "operator", session: "s-berlin" };

function basePacket(id = "pkt_c"): Packet {
  return {
    id,
    context: "Partner email says rejected; dashboard says in-review.",
    user_correction: null,
    chosen_agent: "Analyst",
    correction_kind: null,
    runtime_mode: "demo",
    created_at: "2026-06-06T09:00:00.000Z",
    agent_reads: [{ agent_name: "Analyst", archetype: "Diligence", situation: "read", hidden_risk: null, next_move: null, refusal: null, ordinal: 0 }],
  };
}

test("recordCorrection writes a first-class correction event and returns the record", () => {
  const vault = new Vault(clock);
  const rec = recordCorrection(vault, {
    correction_kind: "outer",
    target_event_id: "evt-1",
    user_note: "routing-mismatch, not a rejection",
    provenance,
  });
  assert.equal(vault.count("correction"), 1);
  assert.equal(rec.correction_kind, "outer");
  assert.equal(rec.target_event_id, "evt-1");
  assert.equal(rec.projectable, true);
  // the stored provenance timestamp comes from the vault clock (deterministic)
  const stored = vault.list("correction")[0]!.payload as { provenance: { at: string } };
  assert.equal(stored.provenance.at, "2026-06-06T10:00:00.000Z");
});

test("emergence corrections are recorded but never projectable (local-only by category)", () => {
  const vault = new Vault(clock);
  const rec = recordCorrection(vault, {
    correction_kind: "emergence",
    target_event_id: "evt-1",
    user_note: "a third the system did not offer",
    provenance,
  });
  assert.equal(rec.projectable, false);
  assert.equal(vault.count("correction"), 1); // still first-class data — recorded, just not projected
});

test("inner / outer / cross are projectable", () => {
  for (const kind of ["inner", "outer", "cross"] as const) {
    const vault = new Vault(clock);
    const rec = recordCorrection(vault, { correction_kind: kind, target_event_id: "e", user_note: "n", provenance });
    assert.equal(rec.projectable, true);
  }
});

test("projectCorrections excludes emergence and strips note + provenance", () => {
  const vault = new Vault(clock);
  recordCorrection(vault, { correction_kind: "outer", target_event_id: "e1", user_note: "note-1", provenance });
  recordCorrection(vault, { correction_kind: "emergence", target_event_id: "e2", user_note: "note-2", provenance });
  recordCorrection(vault, { correction_kind: "cross", target_event_id: "e3", user_note: "note-3", provenance });

  const projected = projectCorrections(vault.list("correction"));
  assert.equal(projected.length, 2); // emergence excluded
  assert.deepEqual(projected.map((p) => p.correction_kind).sort(), ["cross", "outer"]);
  // stripped to exactly id + correction_kind + target_event_id
  for (const p of projected) {
    assert.deepEqual(Object.keys(p).sort(), ["correction_kind", "id", "target_event_id"]);
  }
  // no user_note / provenance leaks outward
  const dump = JSON.stringify(projected);
  assert.equal(dump.includes("note-"), false);
  assert.equal(dump.includes("operator"), false);
});

test("invalid kind, empty target, and missing provenance each throw", () => {
  const vault = new Vault(clock);
  assert.throws(() => recordCorrection(vault, { correction_kind: "sideways" as never, target_event_id: "e", user_note: "n", provenance }), /not canonical/);
  assert.throws(() => recordCorrection(vault, { correction_kind: "outer", target_event_id: "", user_note: "n", provenance }), /target_event_id is required/);
  assert.throws(() => recordCorrection(vault, { correction_kind: "outer", target_event_id: "e", user_note: "n", provenance: { source: "", session: "s" } }), /provenance must be non-null/);
});

test("a correction targets a real packet.anchored event id", async () => {
  const vault = new Vault(clock);
  const anchor = new MockAnchorChain(clock);
  vault.save(basePacket());
  await vault.anchorPacket("pkt_c", anchor);

  const anchoredEvt = vault.list("packet.anchored")[0]!;
  const rec = recordCorrection(vault, {
    correction_kind: "outer",
    target_event_id: anchoredEvt.id,
    user_note: "dashboard is source of truth",
    provenance,
  });
  assert.equal(rec.target_event_id, anchoredEvt.id);
});
