// Anchor-chain interface + receipt types (Sean lane · Berlin AlgoHack).
//
// This is the stable adapter boundary the provenance design doc calls for
// (desktop-pilot/docs/PROVENANCE_ANCHORING_ALGORAND_2026-05-28.md §"Anchor adapter"):
//
//     anchor(hash)            -> receipt { txn_id, anchored_at, ... }
//     fetchAnchoredHash(txid) -> { packet_hash, anchored_at } | null   // verifier reads chain only
//
// Algorand is the chosen implementation (chain-anchor decision 2026-05-21). Keeping this an
// interface means a future RFC-3161 TSA or alternate chain can slot in without touching the
// vault, the packet model, or the agents. Agents NEVER call these (PPA #5: the chain is
// downstream of the correction stream, never an input to a read).

/** The on-chain note payload. By construction this is the ONLY thing that leaves the machine. */
export interface AnchorNote {
  /** Note schema tag, so a verifier knows how to parse the note. */
  schema: string;
  /** Which canonical serialization produced `packet_hash`. */
  canonical_version: string;
  /** SHA-256 hex of the canonical packet bytes. The whole point — nothing else is content. */
  packet_hash: string;
}

/** Metadata a third party needs to independently confirm the anchor on the public chain. */
export interface VerifierMetadata {
  /** Note schema tag (matches {@link AnchorNote.schema}). */
  note_schema: string;
  /** Block round the anchoring txn confirmed in (null on chains/mocks without rounds). */
  confirmed_round: number | null;
  /** Public explorer deep-link to the txn, if the chain has one. */
  explorer_url: string | null;
  /** Indexer endpoint a verifier can query for the txn note. */
  indexer_url: string | null;
  /** Chain genesis id (e.g. Algorand `testnet-v1.0`), pinning which network the txn lives on. */
  genesis_id: string | null;
}

/** The receipt stored back onto the vault packet row. Field set is fixed by the Berlin DACI. */
export interface AnchorReceipt {
  packet_hash: string;
  canonical_version: string;
  anchor_txn_id: string;
  /** ISO-8601. Block timestamp when the chain exposes one, else confirmation time. */
  anchored_at: string;
  chain: string;
  network: string;
  verifier: VerifierMetadata;
}

/** What a verifier reads back off the public chain — hash + when, nothing else. */
export interface OnChainAnchor {
  packet_hash: string;
  canonical_version: string;
  anchored_at: string;
  confirmed_round: number | null;
}

/** A swappable provenance backend. `mock` (default) and `algorand` implement this. */
export interface AnchorChain {
  readonly chain: string;
  readonly network: string;
  /** Anchor a single packet hash. Pattern 3 (selective per-packet) per the 2026-05-21 decision. */
  anchor(packetHash: string, canonicalVersion: string): Promise<AnchorReceipt>;
  /** Read the anchored hash back from the public chain by txn id. Returns null if not found. */
  fetchAnchoredHash(txnId: string): Promise<OnChainAnchor | null>;
}

/** A clock injectable for deterministic tests. Defaults to wall-clock ISO-8601. */
export type Clock = () => string;

export const systemClock: Clock = () => new Date().toISOString();

export const NOTE_SCHEMA = "liminal.anchor.v1";
