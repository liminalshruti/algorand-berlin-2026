import algosdk from 'algosdk';
import crypto from 'crypto';
import type { AccountBalance, AlgoAccount, Ctx, OnChainPayment, RepState } from './contract.js';

// --- TestNet by default, zero setup ------------------------------------------
// `apps/router/src/load-env.ts` loads committed `.env.demo` before this context is
// built. Use `.env` only for private/local overrides such as a personal payer.
const DEFAULT_ALGOD_URL = 'https://testnet-api.algonode.cloud';
const DEFAULT_ALGOD_PORT = 443;
const DEFAULT_INDEXER_URL = 'https://testnet-idx.algonode.cloud';
const DEFAULT_INDEXER_PORT = 443;
const DEFAULT_NETWORK = 'testnet';

const MICROALGO = 1_000_000;

const stubRepState: RepState = { getReputation: () => null };

function loadAccount(mnemonic?: string): AlgoAccount {
  if (mnemonic) {
    const { addr, sk } = algosdk.mnemonicToSecretKey(mnemonic);
    return { addr: addr.toString(), sk };
  }
  const acct = algosdk.generateAccount();
  return { addr: acct.addr.toString(), sk: acct.sk };
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} missing; load .env.demo or set ${key} in .env/local shell`);
  }
  return value;
}

export async function buildContext(repState: RepState = stubRepState): Promise<Ctx> {
  const algodUrl = process.env.ALGOD_URL ?? DEFAULT_ALGOD_URL;
  const algodPort = Number(process.env.ALGOD_PORT ?? DEFAULT_ALGOD_PORT);
  const algodToken = process.env.ALGOD_TOKEN ?? '';
  const indexerUrl = process.env.INDEXER_URL ?? DEFAULT_INDEXER_URL;
  const indexerPort = Number(process.env.INDEXER_PORT ?? DEFAULT_INDEXER_PORT);
  const indexerToken = process.env.INDEXER_TOKEN ?? algodToken;
  const network = process.env.ALGO_NETWORK ?? DEFAULT_NETWORK;
  const algodClient = new algosdk.Algodv2(algodToken, algodUrl, algodPort);
  const indexerClient = new algosdk.Indexer(indexerToken, indexerUrl, indexerPort);

  const payer       = loadAccount(requireEnv('PAYER_MNEMONIC'));
  const facilitator = loadAccount();
  const funded      = payer;

  async function submitTxn(
    from: AlgoAccount,
    to: string,
    amountAlgo: number,
    note: object,
  ): Promise<{ txid: string; round: number }> {
    const params = await algodClient.getTransactionParams().do();
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: from.addr,
      receiver: to,
      amount: BigInt(Math.round(amountAlgo * MICROALGO)),
      suggestedParams: params,
      note: Buffer.from(JSON.stringify(note)),
    });
    const signed = txn.signTxn(from.sk);
    const { txid } = await algodClient.sendRawTransaction(signed).do();
    const confirmed = await algosdk.waitForConfirmation(algodClient, txid, 4);
    return { txid, round: Number(confirmed.confirmedRound) };
  }

  async function anchorNote(
    ref_id: string,
    schema: string,
    hash: string,
  ): Promise<{ txid: string; round: number }> {
    return submitTxn(payer, payer.addr, 0, { schema, ref_id, hash });
  }

  async function lookupPayment(txid: string): Promise<OnChainPayment | null> {
    try {
      const raw = await indexerClient.lookupTransactionByID(txid).do() as {
        transaction?: {
          id?: string;
          sender?: string;
          note?: string;
          'confirmed-round'?: number | bigint;
          'payment-transaction'?: {
            receiver?: string;
            amount?: number | bigint;
          };
        };
      };
      const txn = raw.transaction;
      const payment = txn?.['payment-transaction'];
      if (!txn?.sender || !payment?.receiver) return null;
      const note = txn.note ? Buffer.from(txn.note, 'base64').toString('utf8') : undefined;
      return {
        txid: txn.id ?? txid,
        sender: txn.sender,
        receiver: payment.receiver,
        amount: Number(payment.amount ?? 0) / MICROALGO,
        asset: 'ALGO',
        network,
        ...(note ? { note } : {}),
        ...(txn['confirmed-round'] !== undefined ? { round: Number(txn['confirmed-round']) } : {}),
      };
    } catch {
      return null;
    }
  }

  async function accountBalance(address: string): Promise<AccountBalance | null> {
    try {
      const raw = await algodClient.accountInformation(address).do() as {
        amount?: number | bigint;
        minBalance?: number | bigint;
        min_balance?: number | bigint;
        'min-balance'?: number | bigint;
      };
      const amountMicro = Number(raw.amount ?? 0);
      const minMicro = Number(raw.minBalance ?? raw.min_balance ?? raw['min-balance'] ?? 0);
      return {
        amount: amountMicro / MICROALGO,
        min_balance: minMicro / MICROALGO,
        available: Math.max(0, amountMicro - minMicro) / MICROALGO,
      };
    } catch {
      return null;
    }
  }

  return {
    net: network,
    store: algodClient,
    session: { payer, facilitator, funded },
    agents: new Map(),
    services: [],
    quoteCache: new Map(),
    activeQuotes: new Map(),
    paymentRequirements: new Map(),
    routeStore: new Map(),
    paymentStore: new Map(),
    challengeStore: new Map(),
    feedbackIntentStore: new Map(),
    usedFeedbackPaymentTxids: new Set(),
    repState,
    ledger: [],
    deps: {
      settle: (to, amountAlgo, note) => submitTxn(payer, to, amountAlgo, note),
      anchorNote,
      lookupPayment,
      accountBalance,
      buildReputationEntry: (agent_id, score) => ({ agent_id, score }),
      anchorReputationEntry: async (entry) => {
        const hash = crypto
          .createHash('sha256')
          .update(JSON.stringify(entry))
          .digest('hex');
        const { txid } = await anchorNote('reputation', 'algorand-rep-v1', hash);
        return txid;
      },
      explorerFor: (txid) =>
        network === 'mainnet'
          ? `https://lora.algokit.io/mainnet/transaction/${txid}`
          : network === 'testnet'
            ? `https://lora.algokit.io/testnet/transaction/${txid}`
            : `https://lora.algokit.io/localnet/transaction/${txid}`,
    },
  };
}
