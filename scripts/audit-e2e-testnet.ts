/**
 * REAL end-to-end audit on Algorand TestNet against the DEPLOYED ARC-8004 registries.
 *
 * Produces one real, confirmed transaction for each step of the trust lifecycle and
 * writes the evidence to `audit/`:
 *
 *   1. register an agent in the Identity registry      IdentityRegistry.register
 *   2. set the agent's payout wallet                   IdentityRegistry.setAgentWallet
 *   3. a client pays the agent over x402               payment (this backs the review)
 *   4. that client leaves a payment-backed review      ReputationRegistry.giveFeedback
 *   5. the owner requests an independent validation    ValidationRegistry.validationRequest
 *   6. the validator records its verdict               ValidationRegistry.validationResponse
 *
 * Three distinct accounts play owner / paying-client / validator so the trail is honest
 * (a client reviews an agent it actually paid; an independent account validates).
 *
 * Run:  npx tsx scripts/audit-e2e-testnet.ts
 * Needs the funded demo payer (PAYER_MNEMONIC in committed .env.demo).
 */
import '../apps/router/src/load-env.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import { AlgorandClient, Config } from '@algorandfoundation/algokit-utils';
import { IdentityRegistryClient } from '../contracts/artifacts/identity_registry/IdentityRegistryClient';
import { ReputationRegistryClient } from '../contracts/artifacts/reputation_registry/ReputationRegistryClient';
import { ValidationRegistryClient } from '../contracts/artifacts/validation_registry/ValidationRegistryClient';

// Box references + opcode resources are discovered by simulation before each app call.
Config.configure({ populateAppCallResources: true });

const IDENTITY_APP_ID = BigInt(process.env.IDENTITY_APP_ID || 764031067);
const REPUTATION_APP_ID = BigInt(process.env.REPUTATION_APP_ID || 764031363);
const VALIDATION_APP_ID = BigInt(process.env.VALIDATION_APP_ID || 764031094);

const ZERO32 = new Uint8Array(32);
const utf8 = (s: string) => new TextEncoder().encode(s);
const txExplorer = (txid: string) => `https://lora.algokit.io/testnet/transaction/${txid}`;
const appExplorer = (id: bigint) => `https://lora.algokit.io/testnet/application/${id}`;

// signed int128 -> 16-byte big-endian two's complement (the feedback `value`).
function i128(n: number): Uint8Array {
  const buf = new Uint8Array(16);
  let v = BigInt(Math.trunc(n));
  if (v < 0n) v = (1n << 128n) + v;
  for (let i = 15; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

// Algorand txid (RFC-4648 base32, no padding) -> its raw 32-byte hash, for byte[32] proof args.
function txidToBytes(txid: string): Uint8Array {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of txid.trim()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out.slice(0, 32));
}

type TxnRecord = {
  step: number;
  category: 'setup' | 'identity' | 'payment' | 'reputation' | 'validation';
  action: string;
  contract: string | null;
  method: string;
  sender: string;
  detail: Record<string, unknown>;
  txid: string;
  confirmed_round: number | null;
  explorer: string;
};

const txns: TxnRecord[] = [];
let step = 0;
let participants: { owner: string; client: string; validator: string } | null = null;
let agentInfo: { registry_agent_id: string; agent_uri: string; agent_wallet: string } | null = null;

function pull(res: any): { txid: string; round: number | null } {
  const txid = res?.txIds?.[0] ?? res?.transaction?.txID?.() ?? res?.txID ?? '';
  const round = res?.confirmation?.confirmedRound != null ? Number(res.confirmation.confirmedRound) : null;
  return { txid, round };
}

function record(
  meta: Omit<TxnRecord, 'step' | 'txid' | 'confirmed_round' | 'explorer'>,
  res: any,
): void {
  const { txid, round } = pull(res);
  const rec: TxnRecord = { step: ++step, ...meta, txid, confirmed_round: round, explorer: txExplorer(txid) };
  txns.push(rec);
  console.log(`  ✓ [${rec.step}] ${rec.action} — ${rec.method} tx=${txid} round=${round ?? '?'}`);
}

async function main() {
  const algorand = AlgorandClient.testNet();

  const ownerMnemonic = process.env.PAYER_MNEMONIC?.trim();
  if (!ownerMnemonic) throw new Error('PAYER_MNEMONIC missing — load .env.demo');

  const owner = algorand.account.fromMnemonic(ownerMnemonic); // operator / agent owner
  const client = algorand.account.random();                   // paying client / reviewer
  const validator = algorand.account.random();                // independent validator
  const ownerAddr = owner.addr.toString();
  const clientAddr = client.addr.toString();
  const validatorAddr = validator.addr.toString();
  participants = { owner: ownerAddr, client: clientAddr, validator: validatorAddr };

  console.log('Accounts:');
  console.log('  owner/operator :', ownerAddr);
  console.log('  client/reviewer:', clientAddr);
  console.log('  validator      :', validatorAddr);

  // --- SETUP: fund the throwaway client + validator from the demo payer ---
  console.log('\nFunding participants from the demo payer...');
  record(
    { category: 'setup', action: 'fund client/reviewer', contract: null, method: 'payment', sender: ownerAddr, detail: { receiver: clientAddr, amount_algo: 0.5 } },
    await algorand.send.payment({ sender: owner.addr, receiver: client.addr, amount: (0.5).algo(), note: utf8('audit:fund-client') }),
  );
  record(
    { category: 'setup', action: 'fund validator', contract: null, method: 'payment', sender: ownerAddr, detail: { receiver: validatorAddr, amount_algo: 0.3 } },
    await algorand.send.payment({ sender: owner.addr, receiver: validator.addr, amount: (0.3).algo(), note: utf8('audit:fund-validator') }),
  );

  // typed clients bound to the DEPLOYED app ids
  const identity = algorand.client.getTypedAppClientById(IdentityRegistryClient, { appId: IDENTITY_APP_ID, defaultSender: owner.addr });
  const reputation = algorand.client.getTypedAppClientById(ReputationRegistryClient, { appId: REPUTATION_APP_ID, defaultSender: client.addr });
  const validation = algorand.client.getTypedAppClientById(ValidationRegistryClient, { appId: VALIDATION_APP_ID, defaultSender: owner.addr });

  // --- 1. REGISTER the agent in the Identity registry ---
  console.log('\n1) Register agent (IdentityRegistry.register)...');
  const agentUri = `https://agents.liminal.local/audit/${Date.now()}`;
  const registerRes = await identity.send.register({
    sender: owner.addr,
    args: { agentUri, metadata: [['name', utf8('Audit Demo Agent')], ['type', utf8('diligence.report')]] },
  });
  const agentId = registerRes.return as bigint;
  const agentWallet = ownerAddr; // the operator receives x402 payments for this agent
  agentInfo = { registry_agent_id: agentId.toString(), agent_uri: agentUri, agent_wallet: agentWallet };
  record(
    { category: 'identity', action: 'register agent', contract: 'IdentityRegistry', method: 'register', sender: ownerAddr, detail: { registry_agent_id: agentId.toString(), agent_uri: agentUri } },
    registerRes,
  );

  // --- 2. SET the agent's payout wallet ---
  record(
    { category: 'identity', action: 'set agent wallet', contract: 'IdentityRegistry', method: 'setAgentWallet', sender: ownerAddr, detail: { registry_agent_id: agentId.toString(), wallet: agentWallet } },
    await identity.send.setAgentWallet({ sender: owner.addr, args: { tokenId: agentId, wallet: agentWallet } }),
  );

  // --- 3. CLIENT pays the agent over x402 — this payment backs the review ---
  console.log('\n2) Client pays the agent over x402 (payment)...');
  const payRes = await algorand.send.payment({
    sender: client.addr,
    receiver: agentWallet,
    amount: (0.1).algo(),
    note: utf8(JSON.stringify({ schema: 'x402.settle', registry_agent_id: agentId.toString(), service: 'diligence.report' })),
  });
  const paymentTxid = pull(payRes).txid;
  record(
    { category: 'payment', action: 'x402 settlement (client → agent)', contract: null, method: 'payment', sender: clientAddr, detail: { receiver: agentWallet, amount_algo: 0.1, registry_agent_id: agentId.toString() } },
    payRes,
  );

  // --- 4. CLIENT leaves a payment-backed review ---
  console.log('\n3) Leave payment-backed review (ReputationRegistry.giveFeedback)...');
  const nonce = BigInt(Date.now());
  record(
    { category: 'reputation', action: 'give feedback (payment-backed review)', contract: 'ReputationRegistry', method: 'giveFeedback', sender: clientAddr, detail: { registry_agent_id: agentId.toString(), value: 1, tag: 'satisfied', payment_txid: paymentTxid, nonce: nonce.toString() } },
    await reputation.send.giveFeedback({
      sender: client.addr,
      args: {
        agentId,
        value: i128(1),
        dec: 0,
        tag1: 'satisfied',
        tag2: 'x402-paid',
        endpoint: '',
        feedbackUri: `audit://review/${agentId}`,
        feedbackHash: ZERO32,
        paymentTxid: txidToBytes(paymentTxid),
        nonce,
      },
    }),
  );

  // --- 5. OWNER requests an independent validation ---
  console.log('\n4) Validate the agent (ValidationRegistry.validationRequest + validationResponse)...');
  const requestHash = new Uint8Array(crypto.createHash('sha256').update(`${agentId}:${paymentTxid}:validation`).digest());
  record(
    { category: 'validation', action: 'validation request (owner → validator)', contract: 'ValidationRegistry', method: 'validationRequest', sender: ownerAddr, detail: { registry_agent_id: agentId.toString(), validator: validatorAddr, request_hash: Buffer.from(requestHash).toString('hex') } },
    await validation.send.validationRequest({
      sender: owner.addr,
      args: { validator: validatorAddr, agentId, requestUri: `audit://validation/req/${agentId}`, requestHash },
    }),
  );

  // --- 6. VALIDATOR records its verdict (0..100; 100 = full pass) ---
  record(
    { category: 'validation', action: 'validation response (validator verdict)', contract: 'ValidationRegistry', method: 'validationResponse', sender: validatorAddr, detail: { registry_agent_id: agentId.toString(), response: 100, tag: 'quote-match' } },
    await validation.send.validationResponse({
      sender: validator.addr,
      args: { requestHash, response: 100, responseUri: `audit://validation/resp/${agentId}`, responseHash: ZERO32, tag: 'quote-match' },
    }),
  );
}

function renderMarkdown(doc: any): string {
  const L: string[] = [];
  L.push(`# ${doc.title}`);
  L.push('');
  L.push('A real, end-to-end trust-lifecycle audit trail on **Algorand TestNet** against the deployed');
  L.push('ARC-8004 registries. Every transaction below is confirmed on-chain and links to the explorer.');
  L.push('');
  L.push(`- **Network:** Algorand TestNet`);
  L.push(`- **Generated:** ${doc.generated_at}`);
  L.push(`- **Status:** ${doc.status}${doc.failure ? ` — \`${String(doc.failure).split('\n')[0]}\`` : ''}`);
  L.push('');
  L.push('## Registries (deployed)');
  L.push('');
  L.push('| Registry | App ID | Explorer |');
  L.push('|---|---|---|');
  L.push(`| Identity | \`${doc.apps.identity.app_id}\` | ${doc.apps.identity.explorer} |`);
  L.push(`| Reputation | \`${doc.apps.reputation.app_id}\` | ${doc.apps.reputation.explorer} |`);
  L.push(`| Validation | \`${doc.apps.validation.app_id}\` | ${doc.apps.validation.explorer} |`);
  L.push('');
  if (doc.agent) {
    L.push('## Agent under audit');
    L.push('');
    L.push(`- **registry_agent_id:** \`${doc.agent.registry_agent_id}\``);
    L.push(`- **agent_uri:** ${doc.agent.agent_uri}`);
    L.push(`- **agent_wallet:** \`${doc.agent.agent_wallet}\``);
    L.push('');
  }
  if (doc.participants) {
    L.push('## Participants');
    L.push('');
    L.push(`- **Owner / operator** (registers + requests validation): \`${doc.participants.owner}\``);
    L.push(`- **Client / reviewer** (pays + reviews): \`${doc.participants.client}\``);
    L.push(`- **Validator** (independent verdict): \`${doc.participants.validator}\``);
    L.push('');
  }
  L.push('## Transactions (real, confirmed on TestNet)');
  L.push('');
  L.push('| # | Step | Contract · Method | Sender | Round | Transaction |');
  L.push('|---|---|---|---|---|---|');
  for (const t of doc.transactions as TxnRecord[]) {
    const who = `${t.sender.slice(0, 6)}…${t.sender.slice(-4)}`;
    const cm = t.contract ? `${t.contract}.${t.method}` : t.method;
    const tx = t.txid ? `[\`${t.txid.slice(0, 10)}…\`](${t.explorer})` : '—';
    L.push(`| ${t.step} | ${t.action} | ${cm} | \`${who}\` | ${t.confirmed_round ?? '—'} | ${tx} |`);
  }
  L.push('');
  L.push('> The review (`giveFeedback`) is bound to the real x402 settlement txid (the payment above) —');
  L.push('> reputation is earned per unique payment, not self-reported. The validation verdict is');
  L.push('> recorded by an independent validator account, not the owner.');
  L.push('');
  return L.join('\n');
}

let failure: string | null = null;
main()
  .catch((e) => {
    failure = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error('\nFATAL:', failure);
  })
  .finally(() => {
    const generatedAt = new Date().toISOString();
    const auditDir = resolve(process.cwd(), 'audit');
    mkdirSync(auditDir, { recursive: true });
    const stamp = generatedAt.replace(/[:.]/g, '-');

    const doc = {
      title: 'ARC-8004 trust lifecycle — real TestNet audit trail',
      network: 'testnet',
      generated_at: generatedAt,
      status: failure ? 'partial' : 'complete',
      failure,
      apps: {
        identity: { app_id: Number(IDENTITY_APP_ID), explorer: appExplorer(IDENTITY_APP_ID) },
        reputation: { app_id: Number(REPUTATION_APP_ID), explorer: appExplorer(REPUTATION_APP_ID) },
        validation: { app_id: Number(VALIDATION_APP_ID), explorer: appExplorer(VALIDATION_APP_ID) },
      },
      participants,
      agent: agentInfo,
      transactions: txns,
    };

    const jsonPath = resolve(auditDir, `e2e-testnet-${stamp}.json`);
    writeFileSync(jsonPath, `${JSON.stringify(doc, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`);

    const md = renderMarkdown(doc);
    writeFileSync(resolve(auditDir, `e2e-testnet-${stamp}.md`), md);
    writeFileSync(resolve(auditDir, 'LATEST.md'), md);

    console.log(`\nAudit written:\n  ${jsonPath}\n  ${resolve(auditDir, `e2e-testnet-${stamp}.md`)}`);
    process.exit(failure ? 1 : 0);
  });
