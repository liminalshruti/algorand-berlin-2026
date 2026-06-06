// Verifier utility (Sean lane · Berlin AlgoHack OKRs "verification flow" + "build a verifier utility").
//
// Two-step verification, no vault access (provenance design doc DFD 2, founder/Pattern-3 path):
//   1. recompute SHA-256 over the canonical bytes of the shared packet;
//   2. fetch the anchoring txn's note off the public chain;
//   3. confirm the on-chain hash equals the recomputed hash.
//
// If they match, the shared packet provably existed, byte-for-byte, at the anchoring block time —
// without the verifier ever touching the vault, the keys, or any content beyond what the holder
// chose to share. A single changed character in the shared packet breaks the match.

import { signPacket } from "./packet.ts";
import { type Packet } from "./packet.ts";
import { type AnchorChain } from "./chain/types.ts";

export interface VerifyResult {
  ok: boolean;
  /** Hash recomputed from the shared packet bytes. */
  recomputed_hash: string;
  /** Hash read back off the public chain (null if the txn/note was not found). */
  on_chain_hash: string | null;
  /** Canonical serialization version recorded on-chain. */
  on_chain_version: string | null;
  /** When the chain says the anchor confirmed. */
  anchored_at: string | null;
  confirmed_round: number | null;
  /** Human-readable verdict reason. */
  reason: string;
}

/**
 * Verify a shared packet against its on-chain anchor. The verifier needs only the packet, the
 * txn id, and a read-only view of the chain — never the vault.
 */
export async function verifyPacket(
  sharedPacket: Packet,
  txnId: string,
  chain: AnchorChain,
): Promise<VerifyResult> {
  const recomputed_hash = signPacket(sharedPacket).packet_hash;
  const onChain = await chain.fetchAnchoredHash(txnId);

  if (!onChain) {
    return {
      ok: false,
      recomputed_hash,
      on_chain_hash: null,
      on_chain_version: null,
      anchored_at: null,
      confirmed_round: null,
      reason: `no anchor found on ${chain.chain}/${chain.network} for txn ${txnId}`,
    };
  }

  const ok = onChain.packet_hash === recomputed_hash;
  return {
    ok,
    recomputed_hash,
    on_chain_hash: onChain.packet_hash,
    on_chain_version: onChain.canonical_version,
    anchored_at: onChain.anchored_at,
    confirmed_round: onChain.confirmed_round,
    reason: ok
      ? `packet existed unaltered at ${onChain.anchored_at} (round ${onChain.confirmed_round ?? "n/a"})`
      : "hash mismatch — shared packet does not match the anchored commitment",
  };
}
