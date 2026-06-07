// On-chain agent registration via the deployed ARC-8004 Identity registry.
//
// Mirrors onchain.ts exactly: env-gated, best-effort, dynamic-import. Puts real
// agent NFTs on Algorand TestNet through the SAME `register(agentURI, metadata)`
// ABI the mock console (apps/web/arc8004.js) already speaks.
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
// ABI verified against contracts/artifacts/identity_registry/IdentityRegistry.arc56.json:
//   register(agentURI: string, metadata: (string,byte[])[]) -> uint64
// Confirm the generated method/arg names in IdentityRegistryClient.ts match before the
// live demo (the client decodes the uint64 return into res.return as a bigint).
import type { Ctx } from './contract.js';

export interface RegisteredAgent {
  registryAgentId: string; // on-chain IdentityRegistry uint64
  txid: string;
  appId: number;
  owner: string;
  agentURI: string;
}

// router agent_id → on-chain registry_agent_id, for this server run.
const registryAgentIdByAgentId = new Map<string, string>();
export const registryAgentIdFor = (agent_id: string): string | null =>
  registryAgentIdByAgentId.get(agent_id) ?? null;
export const onChainAgents = (): Array<{ agent_id: string; registry_agent_id: string }> =>
  [...registryAgentIdByAgentId.entries()].map(([agent_id, registry_agent_id]) => ({ agent_id, registry_agent_id }));

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

interface RegisterInput {
  agent_id?: string;                     // optional router key to remember the registry id under
  agentURI: string;
  metadata: Array<[string, Uint8Array]>; // [key, value][]
}

export async function registerAgent(ctx: Ctx, input: RegisterInput): Promise<RegisteredAgent | null> {
  const appId = Number(process.env.IDENTITY_APP_ID || 0);
  if (!appId) return null;                                   // not configured → no-op
  try {
    const { AlgorandClient } = await import('@algorandfoundation/algokit-utils');
    const { IdentityRegistryClient } = await import(
      '../../../contracts/artifacts/identity_registry/IdentityRegistryClient.js'
    );
    const algorand = AlgorandClient.fromEnvironment();
    const mnemonic = process.env.IDENTITY_SUBMITTER_MNEMONIC || process.env.PAYER_MNEMONIC;
    if (!mnemonic) return null;
    const submitter = algorand.account.fromMnemonic(mnemonic);

    const client = algorand.client.getTypedAppClientById(IdentityRegistryClient, {
      appId: BigInt(appId),
      defaultSender: submitter.addr,
    });

    const res = await client.send.register({
      sender: submitter.addr,
      args: { agentUri: input.agentURI, metadata: input.metadata },
    });

    const registryAgentId = (res?.return ?? '').toString();
    const txid = res?.txIds?.[0] ?? res?.transaction?.txID?.() ?? '';
    const owner = submitter.addr.toString();
    if (registryAgentId && input.agent_id) registryAgentIdByAgentId.set(input.agent_id, registryAgentId);
    return txid ? { registryAgentId, txid, appId, owner, agentURI: input.agentURI } : null;
  } catch (_) {
    return null;                                             // best-effort: never break boot/loop
  }
}

// On-boot helper: register everything currently in ctx.agents on-chain and
// remember agent_id → registry_agent_id. Best-effort; logs a line per agent. No-op when unconfigured.
export async function registerSeededAgents(ctx: Ctx): Promise<void> {
  if (!Number(process.env.IDENTITY_APP_ID || 0)) return;
  for (const agent of ctx.agents.values()) {
    if (registryAgentIdByAgentId.has(agent.id)) continue;
    const out = await registerAgent(ctx, {
      agent_id: agent.id,
      agentURI: agent.agent_uri,
      metadata: [['name', utf8(agent.name)]],
    });
    if (out) {
      // eslint-disable-next-line no-console
      console.log(`  registered on-chain: ${agent.name} -> registry_agent_id=${out.registryAgentId} tx=${out.txid}`);
    }
  }
}
