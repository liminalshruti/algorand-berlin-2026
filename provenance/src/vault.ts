// Vault with anchor receipt fields (Sean lane · Berlin AlgoHack OKR "vault receipt fields").
//
// An in-memory model of the liminal-desktop `packets` table extended with the anchor-receipt
// columns the Berlin DACI fixes (ops/briefs/2026-05-30-ppa-opportunity-analysis-latest-pull-daci.md
// action 5): packet_hash, canonical_version, anchor_txn_id, anchored_at, chain, network, and
// verifier metadata. The equivalent ALTER TABLE for the real sqlx vault is in
// migrations/008_packet_anchor_receipt.sql.
//
// The vault is the key-holding, high-fidelity authority (desktop sqlx); anchoring writes ONLY the
// receipt back. `anchorPacket` is the one place the hash crosses to the chain — it computes the
// commitment locally, hands the chain nothing but the hash, and stores the returned receipt.
//
// The vault also carries an append-only EVENT log alongside the packet store. It is the audit
// substrate the correction stream (correction.ts), the per-call audit wrapper (audit.ts), and the
// refusal record (x402/gate.ts) all write through. Events never carry content — only hashes and
// typed metadata — so the privacy fence that holds on chain also holds in the local log. The log
// is in-memory here (zero-dependency, deterministic, offline-first); Phase 2 swaps an identical
// `write`/`list`/`count` surface onto a durable driver (better-sqlite3 / bun:sqlite / node:sqlite).

import { randomUUID } from "node:crypto";
import { type AnchorChain, type AnchorReceipt, type Clock, systemClock } from "./chain/types.ts";
import { type Packet, signPacket } from "./packet.ts";

/** A stored row: the full packet (content stays local) plus an optional anchor receipt. */
export interface VaultRow {
  packet: Packet;
  receipt: AnchorReceipt | null;
}

/** The typed kinds the append-only event log records. */
export type EventKind =
  | "packet.saved" //    a packet entered the vault (hash only)
  | "packet.anchored" // a packet hash was committed on chain
  | "agent.call" //      a per-call audit row (audit.ts)
  | "lane.refusal" //    an out-of-lane request refused for free (gate.ts)
  | "correction"; //     a first-class user correction (correction.ts, PPA #5)

/** One append-only event. Insertion order is the order of record; `id` is stable. */
export interface VaultEvent {
  id: string;
  kind: EventKind;
  payload: unknown;
  createdAt: string;
}

export class Vault {
  private readonly rows = new Map<string, VaultRow>();
  // Append-only log. Array order IS insertion order — the in-memory analogue of SQLite's
  // monotonic rowid, which is the correct ordering key (created_at has only second resolution).
  private readonly events: VaultEvent[] = [];
  private readonly clock: Clock;

  /** A clock is injectable so demos and tests produce deterministic event timestamps. */
  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  /** Persist a packet. Content lives here and only here. */
  save(packet: Packet): void {
    if (this.rows.has(packet.id)) {
      throw new Error(`vault: packet ${packet.id} already exists`);
    }
    this.rows.set(packet.id, { packet, receipt: null });
    // Record the save as a hash-only event — content never enters the log (privacy fence).
    this.write("packet.saved", { packet_id: packet.id, packet_hash: signPacket(packet).packet_hash });
  }

  get(packetId: string): VaultRow | null {
    return this.rows.get(packetId) ?? null;
  }

  getReceipt(packetId: string): AnchorReceipt | null {
    return this.rows.get(packetId)?.receipt ?? null;
  }

  /**
   * Anchor a stored packet's hash on the given chain and write the receipt back onto the row.
   * This is an explicit, selective act (Pattern 3) — anchoring is the only path off the machine,
   * and only `packet_hash` travels.
   */
  async anchorPacket(packetId: string, chain: AnchorChain): Promise<AnchorReceipt> {
    const row = this.rows.get(packetId);
    if (!row) throw new Error(`vault: unknown packet ${packetId}`);
    if (row.receipt) return row.receipt; // anchoring is idempotent at the vault layer — no second event

    const signed = signPacket(row.packet);
    const receipt = await chain.anchor(signed.packet_hash, signed.canonical_version);
    row.receipt = receipt;
    this.write("packet.anchored", {
      packet_id: packetId,
      packet_hash: signed.packet_hash,
      anchor_txn_id: receipt.anchor_txn_id,
      chain: receipt.chain,
      network: receipt.network,
      confirmed_round: receipt.verifier.confirmed_round,
    });
    return receipt;
  }

  /**
   * Produce the share-safe view of a packet: the full packet bytes a verifier needs, with NO
   * receipt-internal vault state. In practice a founder shares this (or a redaction of it) plus
   * the txn id; the verifier recomputes the hash from it. Content disclosure is the founder's
   * choice — the chain never forced it.
   */
  sharePacket(packetId: string): Packet | null {
    return this.rows.get(packetId)?.packet ?? null;
  }

  /**
   * Append a typed event to the append-only log and return it. This is the single write path the
   * correction stream, the audit wrapper, and the refusal record share. Content must never be
   * placed in a payload — only hashes and typed metadata.
   */
  write(kind: EventKind, payload: unknown): VaultEvent {
    const evt: VaultEvent = { id: randomUUID(), kind, payload, createdAt: this.clock() };
    this.events.push(evt);
    return evt;
  }

  /** Events in insertion order, optionally filtered by kind. Returns a copy. */
  list(kind?: EventKind): VaultEvent[] {
    return kind ? this.events.filter((e) => e.kind === kind) : [...this.events];
  }

  /** Count of recorded events, optionally filtered by kind. */
  count(kind?: EventKind): number {
    return kind ? this.events.reduce((n, e) => (e.kind === kind ? n + 1 : n), 0) : this.events.length;
  }

  /** The vault's clock — the single timestamp source, so corrections/events stay deterministic. */
  now(): string {
    return this.clock();
  }
}
