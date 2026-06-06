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
// NOTE: confirm the generated method/arg names against
//   smart_contracts/artifacts/reputation_registry/ReputationRegistryClient.ts
// before relying on this in the live demo. On-chain giveFeedback does not yet take the
// x402 paymentTxid/nonce (ARC-8004 §x402 Profile) — add those to the contract + this call
// when the contract is recompiled.
import type { Ctx } from './contract.js';

// stable agentId per provider for this server run (real systems use the Identity registry id)
const agentIds = new Map<string, bigint>();
let nextAgentId = 1n;
function agentIdFor(provider_id: string): bigint {
  let id = agentIds.get(provider_id);
  if (id === undefined) { id = nextAgentId++; agentIds.set(provider_id, id); }
  return id;
}

// int128 → 16-byte big-endian two's-complement (response is 0..100, always non-negative here)
function i128(n: number): Uint8Array {
  const buf = new Uint8Array(16);
  let v = BigInt(Math.max(0, Math.min(100, Math.trunc(n))));
  for (let i = 15; i >= 0; i--) { buf[i] = Number(v & 0xffn); v >>= 8n; }
  return buf;
}

export interface OnChainFeedback { txid: string; round?: number; appId: number; agentId: string; }

export async function maybeWriteReputation(ctx: Ctx, provider_id: string, response: number): Promise<OnChainFeedback | null> {
  const appId = Number(process.env.REPUTATION_APP_ID || 0);
  if (!appId) return null;                                  // not configured → no-op
  try {
    const { AlgorandClient } = await import('@algorandfoundation/algokit-utils');
    const { ReputationRegistryClient } = await import(
      '../../../smart_contracts/artifacts/reputation_registry/ReputationRegistryClient.js'
    );
    const algorand = AlgorandClient.fromEnvironment();
    const mnemonic = process.env.REPUTATION_SUBMITTER_MNEMONIC || process.env.PAYER_MNEMONIC;
    if (!mnemonic) return null;
    const submitter = algorand.account.fromMnemonic(mnemonic);

    const client = algorand.client.getTypedAppClientById(ReputationRegistryClient, {
      appId: BigInt(appId),
      defaultSender: submitter.addr,
    });

    const agentId = agentIdFor(provider_id);
    const res = await client.send.giveFeedback({
      sender: submitter.addr,
      args: {
        agentId,
        value: i128(response),
        dec: 0,
        tag1: 'x402',
        tag2: response >= 100 ? 'satisfied' : 'corrected',
        endpoint: '',
        feedbackURI: `liminal://verdict/${provider_id}`,
        feedbackHash: new Uint8Array(32),
      },
    });

    const txid = res?.txIds?.[0] ?? res?.transaction?.txID?.() ?? '';
    const round = res?.confirmation?.confirmedRound ? Number(res.confirmation.confirmedRound) : undefined;
    return txid ? { txid, round, appId, agentId: agentId.toString() } : null;
  } catch (_) {
    return null;                                            // best-effort: never break the loop
  }
}
