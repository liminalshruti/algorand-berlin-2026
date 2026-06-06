// On-chain agent registration via the deployed ARC-8004 Identity registry.
//
// Mirrors onchain.ts exactly: env-gated, best-effort, dynamic-import. Puts real
// agent NFTs on Algorand TestNet through the SAME `register(agentURI, metadata)`
// ABI the mock console (public/arc8004.js) already speaks.
//
// Enable with:
//   IDENTITY_APP_ID=<deployed IdentityRegistry app id>
//   IDENTITY_SUBMITTER_MNEMONIC=<25-word mnemonic, funded>   (falls back to PAYER_MNEMONIC)
//   ALGOD_URL / ALGOD_PORT / ALGOD_TOKEN  (or AlgorandClient.fromEnvironment defaults)
//
// The submitter becomes owner == agentWallet (Txn.sender), so every agent is owned
// by one consistent wallet — matches the no-impersonation decision. No-op (returns
// null) and safe when IDENTITY_APP_ID / mnemonic are unset.
//
// ABI verified against smart_contracts/artifacts/identity_registry/IdentityRegistry.arc56.json:
//   register(agentURI: string, metadata: (string,byte[])[]) -> uint64
// Confirm the generated method/arg names in IdentityRegistryClient.ts match before the
// live demo (the client decodes the uint64 return into res.return as a bigint).
import type { Ctx } from './contract.js';

export interface RegisteredAgent {
  agentId: string;       // on-chain uint64
  txid: string;
  appId: number;
  owner: string;
  agentURI: string;
}

// provider_id → on-chain agentId, for this server run (the map step 2 asks for).
const agentIdByProvider = new Map<string, string>();
export const onChainAgentId = (provider_id: string): string | null =>
  agentIdByProvider.get(provider_id) ?? null;
export const onChainAgents = (): Array<{ provider_id: string; agentId: string }> =>
  [...agentIdByProvider.entries()].map(([provider_id, agentId]) => ({ provider_id, agentId }));

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

interface RegisterInput {
  provider_id?: string;                  // optional key to remember the agentId under
  agentURI: string;
  metadata: Array<[string, Uint8Array]>; // [key, value][]
}

export async function registerAgent(ctx: Ctx, input: RegisterInput): Promise<RegisteredAgent | null> {
  const appId = Number(process.env.IDENTITY_APP_ID || 0);
  if (!appId) return null;                                   // not configured → no-op
  try {
    const { AlgorandClient } = await import('@algorandfoundation/algokit-utils');
    const { IdentityRegistryClient } = await import(
      '../../../smart_contracts/artifacts/identity_registry/IdentityRegistryClient.js'
    );
    const algorand = AlgorandClient.fromEnvironment();
    const mnemonic = process.env.IDENTITY_SUBMITTER_MNEMONIC || process.env.PAYER_MNEMONIC;
    if (!mnemonic) return null;
    const submitter = algorand.account.fromMnemonic(mnemonic);

    const client = algorand.client.getTypedAppClientById(IdentityRegistryClient, {
      appId: BigInt(appId),
      defaultSender: submitter.addr,
    });

    const metadata = input.metadata.map(([key, value]) => ({ key, value }));
    const res = await client.send.register({
      sender: submitter.addr,
      args: { agentURI: input.agentURI, metadata },
    });

    const agentId = (res?.return ?? '').toString();
    const txid = res?.txIds?.[0] ?? res?.transaction?.txID?.() ?? '';
    const owner = submitter.addr.toString();
    if (agentId && input.provider_id) agentIdByProvider.set(input.provider_id, agentId);
    return txid ? { agentId, txid, appId, owner, agentURI: input.agentURI } : null;
  } catch (_) {
    return null;                                             // best-effort: never break boot/loop
  }
}

// On-boot helper (step 2): register everything currently in ctx.providers on-chain and
// remember provider_id → agentId. Best-effort; logs a line per agent. No-op when unconfigured.
export async function registerSeededAgents(ctx: Ctx): Promise<void> {
  if (!Number(process.env.IDENTITY_APP_ID || 0)) return;
  for (const p of ctx.providers.values()) {
    if (agentIdByProvider.has(p.id)) continue;
    // providerRegisters() is the canonical lane source (currently the Diligence hack);
    // the true lane rides in metadata even if discovery ignores it for now.
    const out = await registerAgent(ctx, {
      provider_id: p.id,
      agentURI: p.agent_uri,
      metadata: [['name', utf8(p.name)], ['register', utf8('Diligence')]],
    });
    if (out) {
      // eslint-disable-next-line no-console
      console.log(`  registered on-chain: ${p.name} → agentId=${out.agentId} tx=${out.txid}`);
    }
  }
}
