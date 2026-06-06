// Correction stream — runtime classification + emission (PPA #5 substrate).
//
// Lifted from liminal-notion-hack/src/runtime/correction.ts. The four correction_kind values are
// the canonical inner-face emission categories — reused from packet.ts here, not redefined:
//
//   inner     — disagreement about an inner-face position the agent named
//   outer     — disagreement about an outer-face / operational item
//   cross     — disagreement that spans the inner / outer face boundary
//   emergence — the user produced a third the system did not — highest-value, local-only by category
//
// Every correction event carries: correction_kind (canonical four), target_event_id (the
// packet.saved / packet.anchored event being corrected), non-null provenance (source + session),
// and the user_note. A correction is a first-class vault event — user pushback is primary data,
// stored in the vault, that changes the next read. The loop does NOT converge.

import type { CorrectionKind } from "./packet.ts";
import type { Vault, VaultEvent } from "./vault.ts";
import { isProjectable } from "./projection.ts";

export const VALID_CORRECTION_KINDS: CorrectionKind[] = ["inner", "outer", "cross", "emergence"];

export interface CorrectionProvenance {
  source: string;
  session: string;
  at?: string;
}

export interface CorrectionRequest {
  correction_kind: CorrectionKind;
  /** The vault event id of the packet.saved / packet.anchored row being corrected. */
  target_event_id: string;
  user_note: string;
  provenance: CorrectionProvenance;
}

export interface CorrectionRecord {
  id: string;
  correction_kind: CorrectionKind;
  target_event_id: string;
  user_note: string;
  provenance: CorrectionProvenance;
  projectable: boolean;
}

export function recordCorrection(vault: Vault, req: CorrectionRequest): CorrectionRecord {
  if (!VALID_CORRECTION_KINDS.includes(req.correction_kind)) {
    throw new Error(`correction_kind "${req.correction_kind}" is not canonical`);
  }
  if (!req.target_event_id) {
    throw new Error("correction target_event_id is required (it names the read being corrected)");
  }
  if (!req.provenance || !req.provenance.source || !req.provenance.session) {
    throw new Error("correction provenance must be non-null with source + session");
  }
  // Route the provenance timestamp through the vault clock so demos/tests stay deterministic.
  const provenance: CorrectionProvenance = { ...req.provenance, at: req.provenance.at ?? vault.now() };
  const evt = vault.write("correction", {
    correction_kind: req.correction_kind,
    target_event_id: req.target_event_id,
    user_note: req.user_note,
    provenance,
  });
  const projectable = isProjectable({ kind: evt.kind, payload: evt.payload as { correction_kind?: string } });
  return {
    id: evt.id,
    correction_kind: req.correction_kind,
    target_event_id: req.target_event_id,
    user_note: req.user_note,
    provenance,
    projectable,
  };
}

// A projection of corrections for cross-boundary emission. emergence-class corrections are excluded
// by category; the returned objects carry id + kind + target only — no user_note, no provenance.
export interface ProjectedCorrection {
  id: string;
  correction_kind: Exclude<CorrectionKind, "emergence">;
  target_event_id: string;
}

export function projectCorrections(events: VaultEvent[]): ProjectedCorrection[] {
  const out: ProjectedCorrection[] = [];
  for (const e of events) {
    if (e.kind !== "correction") continue;
    const p = e.payload as { correction_kind: CorrectionKind; target_event_id: string };
    if (!isProjectable({ kind: e.kind, payload: p })) continue;
    out.push({
      id: e.id,
      correction_kind: p.correction_kind as Exclude<CorrectionKind, "emergence">,
      target_event_id: p.target_event_id,
    });
  }
  return out;
}
