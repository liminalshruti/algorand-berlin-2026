// In-memory mock anchor chain (Sean lane · Berlin AlgoHack).
//
// Default backend: zero dependencies, no Docker, no network, no secrets. It faithfully models the
// privacy fence — the note it stores carries ONLY {schema, canonical_version, packet_hash}, and
// `fetchAnchoredHash` round-trips through the serialized note bytes exactly as a real verifier
// would parse them off-chain. This is what makes `npm test` and the offline demo runnable while
// preserving the property the tests actually check: nothing but the hash is on the wire.
//
// Determinism: the txn id is derived from the note bytes (no randomness), and the timestamp comes
// from an injectable clock — so tests get reproducible receipts.

import {
  type AnchorChain,
  type AnchorNote,
  type AnchorReceipt,
  type Clock,
  NOTE_SCHEMA,
  type OnChainAnchor,
  systemClock,
} from "./types.ts";
import { createHash } from "node:crypto";

interface StoredTxn {
  /** Exactly the bytes a real chain would hold in its note field. */
  note: Uint8Array;
  anchored_at: string;
  confirmed_round: number;
}

export class MockAnchorChain implements AnchorChain {
  readonly chain = "algorand";
  readonly network = "mock";

  private readonly clock: Clock;
  private readonly ledger = new Map<string, StoredTxn>();
  private round = 1000;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  async anchor(packetHash: string, canonicalVersion: string): Promise<AnchorReceipt> {
    const note: AnchorNote = {
      schema: NOTE_SCHEMA,
      canonical_version: canonicalVersion,
      packet_hash: packetHash,
    };
    const noteBytes = new TextEncoder().encode(JSON.stringify(note));

    // Deterministic, Algorand-shaped txn id (52 base32 chars) derived from the note.
    const txid = mockTxId(noteBytes);
    const anchored_at = this.clock();
    const confirmed_round = ++this.round;

    this.ledger.set(txid, { note: noteBytes, anchored_at, confirmed_round });

    return {
      packet_hash: packetHash,
      canonical_version: canonicalVersion,
      anchor_txn_id: txid,
      anchored_at,
      chain: this.chain,
      network: this.network,
      verifier: {
        note_schema: NOTE_SCHEMA,
        confirmed_round,
        explorer_url: `mock://anchor/${txid}`,
        indexer_url: "mock://indexer",
        genesis_id: "mock-v1.0",
      },
    };
  }

  async fetchAnchoredHash(txnId: string): Promise<OnChainAnchor | null> {
    const stored = this.ledger.get(txnId);
    if (!stored) return null;
    // Parse the note exactly as a verifier would — from raw bytes, not from in-memory objects.
    const note = JSON.parse(new TextDecoder().decode(stored.note)) as AnchorNote;
    return {
      packet_hash: note.packet_hash,
      canonical_version: note.canonical_version,
      anchored_at: stored.anchored_at,
      confirmed_round: stored.confirmed_round,
    };
  }

  /** Test/inspection helper: the raw note bytes a real chain would publish for this txn. */
  rawNote(txnId: string): Uint8Array | null {
    return this.ledger.get(txnId)?.note ?? null;
  }
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function mockTxId(noteBytes: Uint8Array): string {
  const digest = createHash("sha256").update(noteBytes).digest();
  let out = "";
  for (let i = 0; i < 52; i++) {
    out += BASE32[digest[i % digest.length]! % 32];
  }
  return out;
}
