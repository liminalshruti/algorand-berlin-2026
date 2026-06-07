// Shayaun's lane — optional on-chain reputation write (the verdict → real giveFeedback).
//
// Puts ONE real on-chain write in the trust loop: after /api/validate computes a verdict,
// it calls `giveFeedback` on the deployed ARC-8004 Reputation registry, returning the txid.
//
// Env-gated + best-effort by design — if the registry isn't configured (or the call fails)
// this returns null and the loop is unaffected (verdict still anchored hash-only). To enable:
//   REPUTATION_APP_ID=<deployed app id>
//   REPUTATION_SUBMITTER_MNEMONIC=<25-word mnemonic, funded>   (falls back to PAYER_MNEMONIC)
//   ALGOD_URL / ALGOD_PORT / ALGOD_TOKEN  (or AlgorandClient.fromEnvironment defaults)
//
// ABI verified against ReputationRegistry.arc56.json: giveFeedback now takes the mandatory
// x402 coupling paymentTxid(byte[32]) + nonce(uint64); the contract rejects an all-zero proof
// and replay-guards each settlement txid to one feedback. We pass the real x402 settlement
// txid + a random nonce. agentId is the REAL Identity-registry id from the on-boot registration
// (identity-onchain.ts), falling back to a per-run counter when that map is empty.
import type { Ctx } from './contract.js';
import { registryAgentIdFor } from './identity-onchain.js';

// fallback registry agent id per router agent_id for this server run (used only if
// the agent wasn't registered on-chain at boot).
const agentIds = new Map<string, bigint>();
let nextAgentId = 1n;
function agentIdFor(agent_id: string): bigint {
  const real = registryAgentIdFor(agent_id);
  if (real) return BigInt(real);
  let id = agentIds.get(agent_id);
  if (id === undefined) { id = nextAgentId++; agentIds.set(agent_id, id); }
  return id;
}

// int128 → 16-byte big-endian two's-complement (response is 0..100, always non-negative here)
function i128(n: number): Uint8Array {
  const buf = new Uint8Array(16);
  let v = BigInt(Math.max(0, Math.min(100, Math.trunc(n))));
  for (let i = 15; i >= 0; i--) { buf[i] = Number(v & 0xffn); v >>= 8n; }
  return buf;
}

// Algorand txid (RFC-4648 base32, no padding, 52 chars) → its raw 32-byte hash for byte[32].
function txidToBytes(txid: string): Uint8Array {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of txid.trim()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((value >>> bits) & 0xff); }
  }
  return new Uint8Array(out.slice(0, 32));
}

const isZero = (b: Uint8Array) => b.every((x) => x === 0);

export interface OnChainFeedback { txid: string; round?: number; appId: number; agentId: string; }

// paymentTxid = the x402 settlement txid (from ctx.paymentStore → pay.txids[0]); required by the
// coupled contract. Returns null (no-op) when unconfigured OR when no valid proof is available.
export async function maybeWriteReputation(ctx: Ctx, agent_id: string, response: number, paymentTxid = ''): Promise<OnChainFeedback | null> {
  const appId = Number(process.env.REPUTATION_APP_ID || 0);
  if (!appId) return null;                                  // not configured → no-op
  const proof = txidToBytes(paymentTxid);
  if (isZero(proof)) return null;                           // contract rejects all-zero proof
  try {
    const { AlgorandClient } = await import('@algorandfoundation/algokit-utils');
    const { ReputationRegistryClient } = await import(
      '../../../contracts/artifacts/reputation_registry/ReputationRegistryClient.js'
    );
    const algorand = AlgorandClient.fromEnvironment();
    const mnemonic = process.env.REPUTATION_SUBMITTER_MNEMONIC || process.env.PAYER_MNEMONIC;
    if (!mnemonic) return null;
    const submitter = algorand.account.fromMnemonic(mnemonic);

    const client = algorand.client.getTypedAppClientById(ReputationRegistryClient, {
      appId: BigInt(appId),
      defaultSender: submitter.addr,
    });

    const agentId = agentIdFor(agent_id);
    const res = await client.send.giveFeedback({
      sender: submitter.addr,
      args: {
        agentId,
        value: i128(response),
        dec: 0,
        tag1: 'x402',
        tag2: response >= 100 ? 'satisfied' : 'corrected',
        endpoint: '',
        feedbackUri: `liminal://verdict/${agent_id}`,
        feedbackHash: new Uint8Array(32),
        paymentTxid: proof,                                 // x402 settlement proof (byte[32])
        nonce: BigInt(Date.now()) * 1000n + BigInt((Math.random() * 1000) | 0),
      },
    });

    const txid = res?.txIds?.[0] ?? res?.transaction?.txID?.() ?? '';
    const round = res?.confirmation?.confirmedRound ? Number(res.confirmation.confirmedRound) : undefined;
    return txid ? { txid, round, appId, agentId: agentId.toString() } : null;
  } catch (_) {
    return null;                                            // best-effort: never break the loop
  }
}
