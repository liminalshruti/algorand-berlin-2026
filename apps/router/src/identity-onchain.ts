// On-chain agent registration via the deployed ARC-8004 Identity registry.
//
// Live writes are explicit: `npm run register:testnet-agents` for the known
// Honest/Cheat batch, or POST /api/agents/register for manual registration.
// Router boot only reads committed evidence and maps agent_id -> registry_agent_id.
import type { Ctx } from './contract.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { knownTestnetAgentFor } from './known-agents.js';

export const KNOWN_AGENT_REGISTRATIONS_PATH = 'docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json';

export type KnownAgentRegistrationStatus = 'pending' | 'registered' | 'blocked';

export type KnownAgentRegistrationRecord = {
  name: string;
  agent_uri: string;
  agent_wallet: string;
  registry_agent_id: string | null;
  app_id: number | null;
  owner: string | null;
  tx_id: string | null;
  wallet_tx_id: string | null;
  wallet_set_error?: string | null;
  explorer: string | null;
  wallet_explorer: string | null;
  registered_at: string | null;
  status: KnownAgentRegistrationStatus;
};

export type KnownAgentRegistrationsFile = {
  network: 'testnet';
  app_id: number;
  updated_at: string | null;
  agents: KnownAgentRegistrationRecord[];
};

export interface RegisteredAgent {
  registryAgentId: string; // on-chain IdentityRegistry uint64
  txid: string;
  walletTxid?: string;
  walletSetError?: string;
  appId: number;
  owner: string;
  agentURI: string;
  agentWallet?: string;
}

// router agent_id → on-chain registry_agent_id, for this server run.
const registryAgentIdByAgentId = new Map<string, string>();
export const registryAgentIdFor = (agent_id: string): string | null =>
  registryAgentIdByAgentId.get(agent_id) ?? null;
export const onChainAgents = (): Array<{ agent_id: string; registry_agent_id: string }> =>
  [...registryAgentIdByAgentId.entries()].map(([agent_id, registry_agent_id]) => ({ agent_id, registry_agent_id }));

export interface RegisterInput {
  agent_id?: string;                     // optional router key to remember the registry id under
  agentURI: string;
  agentWallet?: string;
  metadata: Array<[string, Uint8Array]>; // [key, value][]
}

export function readKnownAgentRegistrations(
  filename = resolve(process.cwd(), KNOWN_AGENT_REGISTRATIONS_PATH),
): KnownAgentRegistrationRecord[] {
  if (!existsSync(filename)) return [];
  try {
    const parsed = JSON.parse(readFileSync(filename, 'utf8')) as Partial<KnownAgentRegistrationsFile>;
    return Array.isArray(parsed.agents) ? parsed.agents : [];
  } catch {
    return [];
  }
}

export function applyKnownAgentRegistrations(
  ctx: Pick<Ctx, 'agents'>,
  records: KnownAgentRegistrationRecord[] = readKnownAgentRegistrations(),
): number {
  let mapped = 0;
  for (const agent of ctx.agents.values()) {
    const known = knownTestnetAgentFor(agent);
    if (!known) continue;
    const record = records.find((candidate) => {
      return candidate.agent_uri === known.agent_uri && candidate.agent_wallet === known.agent_wallet;
    });
    if (typeof record?.registry_agent_id !== 'string' || !record.registry_agent_id.trim()) {
      registryAgentIdByAgentId.delete(agent.id);
      continue;
    }
    registryAgentIdByAgentId.set(agent.id, record.registry_agent_id.trim());
    mapped += 1;
  }
  return mapped;
}

async function sendIdentityRegistration(input: RegisterInput): Promise<RegisteredAgent | null> {
  const appId = Number(process.env.IDENTITY_APP_ID || 0);
  if (!appId) return null;                                   // not configured → no-op
  const mnemonic = process.env.IDENTITY_SUBMITTER_MNEMONIC;
  if (!mnemonic) return null;
  const { AlgorandClient } = await import('@algorandfoundation/algokit-utils');
  const { IdentityRegistryClient } = await import(
    '../../../contracts/artifacts/identity_registry/IdentityRegistryClient.js'
  );
  const algorand = AlgorandClient.fromEnvironment();
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
  if (!txid) return null;

  let walletTxid: string | undefined;
  let walletSetError: string | undefined;
  if (registryAgentId && input.agentWallet) {
    try {
      const walletRes = await client.send.setAgentWallet({
        sender: submitter.addr,
        args: {
          tokenId: BigInt(registryAgentId),
          wallet: input.agentWallet,
        },
      });
      walletTxid = walletRes?.txIds?.[0] ?? walletRes?.transaction?.txID?.() ?? undefined;
    } catch (error) {
      walletSetError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    registryAgentId,
    txid,
    ...(walletTxid ? { walletTxid } : {}),
    ...(walletSetError ? { walletSetError } : {}),
    appId,
    owner,
    agentURI: input.agentURI,
    ...(input.agentWallet ? { agentWallet: input.agentWallet } : {}),
  };
}

export async function submitIdentityRegistration(input: RegisterInput): Promise<RegisteredAgent | null> {
  try {
    return await sendIdentityRegistration(input);
  } catch {
    return null;                                             // best-effort: never break boot/loop
  }
}

export async function requireIdentityRegistration(input: RegisterInput): Promise<RegisteredAgent | null> {
  return sendIdentityRegistration(input);
}

export async function registerAgent(_ctx: Ctx, input: RegisterInput): Promise<RegisteredAgent | null> {
  const out = await submitIdentityRegistration(input);
  if (out?.registryAgentId && input.agent_id) registryAgentIdByAgentId.set(input.agent_id, out.registryAgentId);
  return out;
}
