import '../apps/router/src/load-env.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import algosdk from 'algosdk';
import { parseAgentCard } from '../apps/router/src/agents.js';
import {
  KNOWN_AGENT_REGISTRATIONS_PATH,
  type KnownAgentRegistrationRecord,
  type KnownAgentRegistrationsFile,
  readKnownAgentRegistrations,
  requireIdentityRegistration,
} from '../apps/router/src/identity-onchain.js';
import { KNOWN_TESTNET_AGENTS, type KnownTestnetAgent } from '../apps/router/src/known-agents.js';

const EXPECTED_IDENTITY_APP_ID = 764031067;
const MIN_OPERATOR_BALANCE_ALGO = 1;
const MICROALGO = 1_000_000;

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const checkOnly = args.has('--check') || args.has('--dry-run');

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function explorerFor(txid: string): string {
  return `https://lora.algokit.io/testnet/transaction/${txid}`;
}

function keyFor(input: Pick<KnownAgentRegistrationRecord, 'agent_uri' | 'agent_wallet'>): string {
  return `${input.agent_uri}::${input.agent_wallet}`;
}

function emptyRecord(agent: KnownTestnetAgent): KnownAgentRegistrationRecord {
  return {
    name: agent.name,
    agent_uri: agent.agent_uri,
    agent_wallet: agent.agent_wallet,
    registry_agent_id: null,
    app_id: null,
    owner: null,
    tx_id: null,
    wallet_tx_id: null,
    wallet_set_error: null,
    explorer: null,
    wallet_explorer: null,
    registered_at: null,
    status: 'pending',
  };
}

function readEvidence(): KnownAgentRegistrationRecord[] {
  const records = readKnownAgentRegistrations();
  const byKey = new Map(records.map((record) => [keyFor(record), record]));
  return KNOWN_TESTNET_AGENTS.map((agent) => byKey.get(keyFor(agent)) ?? emptyRecord(agent));
}

function writeEvidence(records: KnownAgentRegistrationRecord[]): void {
  const outputPath = resolve(process.cwd(), KNOWN_AGENT_REGISTRATIONS_PATH);
  const body: KnownAgentRegistrationsFile = {
    network: 'testnet',
    app_id: EXPECTED_IDENTITY_APP_ID,
    updated_at: new Date().toISOString(),
    agents: KNOWN_TESTNET_AGENTS.map((agent) => {
      return records.find((record) => keyFor(record) === keyFor(agent)) ?? emptyRecord(agent);
    }),
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(body, null, 2)}\n`);
}

function upsertRecord(records: KnownAgentRegistrationRecord[], next: KnownAgentRegistrationRecord): KnownAgentRegistrationRecord[] {
  const byKey = new Map(records.map((record) => [keyFor(record), record]));
  byKey.set(keyFor(next), next);
  return KNOWN_TESTNET_AGENTS.map((agent) => byKey.get(keyFor(agent)) ?? emptyRecord(agent));
}

function readCard(agent: KnownTestnetAgent) {
  const filename = resolve(process.cwd(), agent.local_card_path);
  if (!existsSync(filename)) throw new Error(`Missing local card fixture: ${agent.local_card_path}`);
  const parsed = parseAgentCard(JSON.parse(readFileSync(filename, 'utf8')) as unknown, agent.agent_uri);
  if (parsed.name !== agent.name) throw new Error(`${agent.name}: card name mismatch: ${parsed.name}`);
  if (parsed.agent_wallet !== agent.agent_wallet) throw new Error(`${agent.name}: card wallet mismatch: ${parsed.agent_wallet}`);
  return parsed;
}

async function readOperatorBalance(address: string): Promise<number> {
  const client = new algosdk.Algodv2(
    process.env.ALGOD_TOKEN ?? '',
    process.env.ALGOD_URL ?? 'https://testnet-api.algonode.cloud',
    Number(process.env.ALGOD_PORT ?? 443),
  );
  const account = await client.accountInformation(address).do();
  return Number(account.amount ?? 0) / MICROALGO;
}

async function main(): Promise<void> {
  const appId = Number(requireEnv('IDENTITY_APP_ID'));
  if (appId !== EXPECTED_IDENTITY_APP_ID) {
    throw new Error(`IDENTITY_APP_ID must be ${EXPECTED_IDENTITY_APP_ID}; got ${appId}`);
  }

  const mnemonic = requireEnv('IDENTITY_SUBMITTER_MNEMONIC');
  const submitter = algosdk.mnemonicToSecretKey(mnemonic).addr.toString();
  const balance = await readOperatorBalance(submitter);
  if (balance < MIN_OPERATOR_BALANCE_ALGO) {
    throw new Error(
      `IDENTITY_SUBMITTER_ADDRESS ${submitter} has ${balance} ALGO; expected an already-funded TestNet submitter with at least ${MIN_OPERATOR_BALANCE_ALGO} ALGO. Check IDENTITY_SUBMITTER_MNEMONIC in local .env.`,
    );
  }

  const cards = KNOWN_TESTNET_AGENTS.map((agent) => ({ agent, card: readCard(agent) }));
  console.log(`Identity operator: ${submitter}`);
  console.log(`Identity app id: ${appId}`);
  console.log(`Validated ${cards.length} canonical Honest/Cheat cards`);

  if (checkOnly) {
    console.log('Check complete; no registration transactions sent.');
    return;
  }

  let records = readEvidence();
  for (const { agent, card } of cards) {
    const existing = records.find((record) => keyFor(record) === keyFor(agent));
    if (existing?.registry_agent_id && !force) {
      console.log(`${agent.name}: already registered as registry_agent_id=${existing.registry_agent_id}; skipping`);
      continue;
    }

    console.log(`${agent.name}: registering ${agent.agent_uri}`);
    const out = await requireIdentityRegistration({
      agentURI: card.agent_uri,
      agentWallet: card.agent_wallet,
      metadata: [['name', utf8(card.name)]],
    });
    if (!out?.registryAgentId || !out.txid) {
      throw new Error(`${agent.name}: registration returned no registry_agent_id/txid`);
    }

    const record: KnownAgentRegistrationRecord = {
      name: agent.name,
      agent_uri: agent.agent_uri,
      agent_wallet: agent.agent_wallet,
      registry_agent_id: out.registryAgentId,
      app_id: out.appId,
      owner: out.owner,
      tx_id: out.txid,
      wallet_tx_id: out.walletTxid ?? null,
      wallet_set_error: out.walletSetError ?? null,
      explorer: explorerFor(out.txid),
      wallet_explorer: out.walletTxid ? explorerFor(out.walletTxid) : null,
      registered_at: new Date().toISOString(),
      status: out.walletSetError || !out.walletTxid ? 'blocked' : 'registered',
    };
    records = upsertRecord(records, record);
    writeEvidence(records);

    if (record.status !== 'registered') {
      throw new Error(`${agent.name}: setAgentWallet did not complete: ${record.wallet_set_error ?? 'missing wallet txid'}`);
    }
    console.log(
      `${agent.name}: registry_agent_id=${record.registry_agent_id} register_tx=${record.tx_id} wallet_tx=${record.wallet_tx_id}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
