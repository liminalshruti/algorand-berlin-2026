import '../apps/router/src/load-env.js';
import algosdk from 'algosdk';

const MICROALGO = 1_000_000;
const DEFAULT_ROUTER_BASE_URL = 'http://localhost:3001';
const DEFAULT_ALGOD_URL = 'https://testnet-api.algonode.cloud';
const DEFAULT_ALGOD_PORT = 443;
const CHEAT_WALLET = '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ';
const MAX_EXPECTED_SPEND_ALGO = 0.1;
const FEE_BUFFER_ALGO = 0.01;

type Json = Record<string, unknown>;

type RouteOption = {
  option_id: string;
  name?: string;
  price?: number;
  pay_to?: string;
};

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} missing`);
  return value;
}

async function postJson(path: string, body: Json): Promise<Json> {
  const baseUrl = process.env.ROUTER_BASE_URL ?? DEFAULT_ROUTER_BASE_URL;
  const res = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as Json;
  if (!res.ok) throw new Error(`${path} failed ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function postJsonAllowError(path: string, body: Json): Promise<{ status: number; body: Json }> {
  const baseUrl = process.env.ROUTER_BASE_URL ?? DEFAULT_ROUTER_BASE_URL;
  const res = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) as Json };
}

async function sendPayment(
  algod: algosdk.Algodv2,
  account: algosdk.Account,
  receiver: string,
  amountAlgo: number,
  note: string,
): Promise<{ txid: string; round: number }> {
  const params = await algod.getTransactionParams().do();
  const sender = account.addr.toString();
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver,
    amount: BigInt(Math.round(amountAlgo * MICROALGO)),
    suggestedParams: params,
    note: Buffer.from(note, 'utf8'),
  });
  const signed = txn.signTxn(account.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  const confirmed = await algosdk.waitForConfirmation(algod, txid, 4);
  return { txid, round: Number(confirmed.confirmedRound) };
}

function routeOptions(route: Json): RouteOption[] {
  return Array.isArray(route.options) ? route.options as RouteOption[] : [];
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} missing`);
  return value.trim();
}

function numberField(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} missing`);
  return parsed;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--spend')) {
    throw new Error('Refusing to spend without --spend. Use npm run smoke:testnet:proof.');
  }

  const mnemonic = process.env.LOW_SPEND_PAYER_MNEMONIC?.trim() || requireEnv('PAYER_MNEMONIC');
  const payer = algosdk.mnemonicToSecretKey(mnemonic);
  const payerAddress = payer.addr.toString();
  const algod = new algosdk.Algodv2(
    process.env.ALGOD_TOKEN ?? '',
    process.env.ALGOD_URL ?? DEFAULT_ALGOD_URL,
    Number(process.env.ALGOD_PORT ?? DEFAULT_ALGOD_PORT),
  );

  console.log('low-spend proof smoke');
  console.log(`  payer=${payerAddress}`);

  const route = await postJson('/api/route', {
    service_id: 'diligence.report',
    task: 'low-spend proof smoke: catch quote drift',
  });
  const option = routeOptions(route).find((candidate) => {
    return candidate.pay_to === CHEAT_WALLET || candidate.name === 'Cheat Agent' || candidate.price === 0.04;
  });
  if (!option) throw new Error('Cheat route option not found');

  const routeId = stringField(route.route_id, 'route_id');
  console.log(`  route_id=${routeId}`);
  console.log(`  option_id=${option.option_id}`);

  const challenge = await postJson('/api/challenge', {
    route_id: routeId,
    option_id: option.option_id,
  });
  const amount = numberField(challenge.amount, 'challenge.amount');
  const payTo = stringField(challenge.pay_to, 'challenge.pay_to');
  const paymentNote = stringField(challenge.payment_note, 'challenge.payment_note');
  const challengeId = stringField(challenge.challenge_id, 'challenge.challenge_id');
  const expectedSpend = amount + FEE_BUFFER_ALGO;
  if (expectedSpend > MAX_EXPECTED_SPEND_ALGO) {
    throw new Error(`Refusing smoke: expected spend ${expectedSpend} ALGO exceeds ${MAX_EXPECTED_SPEND_ALGO}`);
  }
  if (payTo !== CHEAT_WALLET) throw new Error(`Expected Cheat wallet ${CHEAT_WALLET}; got ${payTo}`);

  console.log(`  challenge_id=${challengeId}`);
  console.log(`  settlement=${amount} ALGO -> ${payTo}`);
  const settlement = await sendPayment(algod, payer, payTo, amount, paymentNote);
  console.log(`  settlement_txid=${settlement.txid} round=${settlement.round}`);

  const intent = await postJson('/api/feedback/intent', {
    challenge_id: challengeId,
    settlement_txid: settlement.txid,
    user_id: payerAddress,
    response: 0,
  });
  const feedbackIntentId = stringField(intent.feedback_intent_id, 'feedback_intent_id');
  const authNote = stringField(intent.note, 'feedback auth note');
  const auth = await sendPayment(algod, payer, payerAddress, 0, authNote);
  console.log(`  auth_txid=${auth.txid} round=${auth.round}`);

  const feedback = await postJson('/api/feedback', {
    feedback_intent_id: feedbackIntentId,
    auth_txid: auth.txid,
  });
  console.log(`  feedback accepted=${feedback.accepted} new_reputation=${feedback.new_reputation}`);

  const duplicate = await postJsonAllowError('/api/feedback/intent', {
    challenge_id: challengeId,
    settlement_txid: settlement.txid,
    user_id: payerAddress,
    response: 100,
  });
  if (duplicate.status !== 400) {
    throw new Error(`Expected duplicate feedback rejection; got ${duplicate.status}`);
  }
  console.log('  duplicate feedback rejected');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
