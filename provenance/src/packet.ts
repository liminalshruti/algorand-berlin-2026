// Packet model + signing (Sean lane · Berlin AlgoHack).
//
// The shape mirrors the real vault schema in liminal-desktop verbatim, so a packet hashed here
// hashes identically when the desktop app adopts this serialization:
//   src-tauri/src/db/migrations/002_packets.sql — `packets` + `agent_reads`
//
// "Signing" in this slice means producing the canonical commitment: a (canonical_version,
// packet_hash) pair over a FIXED projection of the packet. The local vault remains the
// key-holding authority (desktop sqlx, owner-keyed); the chain only ever sees `packet_hash`.
// An explicit ed25519 packet signature is a forward extension noted in the README — out of scope
// for the Berlin OKR, which is hash-anchoring.

import { CANONICAL_VERSION, canonicalize, hashCanonical } from "./canonical.ts";

export type CorrectionKind = "inner" | "outer" | "cross" | "emergence";
export type RuntimeMode = "demo" | "live";

/** One bounded agent's read — mirrors `agent_reads` columns. */
export interface AgentRead {
  agent_name: string;
  archetype: string;
  situation: string;
  hidden_risk: string | null;
  next_move: string | null;
  refusal: string | null;
  ordinal: number;
}

/** A signed deliberation packet — mirrors the `packets` row + its `agent_reads`. */
export interface Packet {
  id: string;
  context: string;
  user_correction: string | null;
  chosen_agent: string | null;
  correction_kind: CorrectionKind | null;
  runtime_mode: RuntimeMode | null;
  /** ISO-8601, fixed at sign time. NEVER `now()` at hash time — the hash must be reproducible. */
  created_at: string;
  agent_reads: AgentRead[];
}

/** The canonical commitment over a packet. `packet_hash` is what gets anchored. */
export interface SignedPacket {
  canonical_version: string;
  packet_hash: string;
  /** The canonical JSON bytes the hash was taken over. Kept local; shown in the demo, never sent. */
  canonical_json: string;
}

// The hash domain is a FIXED allowlist of fields. Anything not listed here — a UI-only flag, a
// future incidental column — is structurally excluded from the commitment, so it can neither
// destabilize an existing hash nor smuggle content into one.
function projectAgentRead(r: AgentRead): Record<string, unknown> {
  return {
    agent_name: r.agent_name,
    archetype: r.archetype,
    situation: r.situation,
    hidden_risk: r.hidden_risk ?? null,
    next_move: r.next_move ?? null,
    refusal: r.refusal ?? null,
    ordinal: r.ordinal,
  };
}

/**
 * Project a packet onto its canonical, hash-bearing shape. Agent reads are sorted by `ordinal`
 * so array order in memory does not affect the hash. (Key order is handled by the canonicalizer.)
 */
export function canonicalPacket(p: Packet): Record<string, unknown> {
  return {
    id: p.id,
    context: p.context,
    user_correction: p.user_correction ?? null,
    chosen_agent: p.chosen_agent ?? null,
    correction_kind: p.correction_kind ?? null,
    runtime_mode: p.runtime_mode ?? null,
    created_at: p.created_at,
    agent_reads: [...p.agent_reads]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map(projectAgentRead),
  };
}

/** Produce the canonical commitment for a packet: `{ canonical_version, packet_hash, canonical_json }`. */
export function signPacket(p: Packet): SignedPacket {
  const canonical_json = canonicalize(canonicalPacket(p));
  return {
    canonical_version: CANONICAL_VERSION,
    packet_hash: hashCanonical(canonical_json),
    canonical_json,
  };
}
