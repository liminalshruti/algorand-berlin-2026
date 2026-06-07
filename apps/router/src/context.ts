import algosdk from 'algosdk';
import crypto from 'crypto';
import type { AlgoAccount, Ctx, RepState } from './contract.js';

// --- TestNet by default, zero setup ------------------------------------------
// `apps/router/src/load-env.ts` loads committed `.env.demo` before this context is
// built. Use `.env` only for private/local overrides such as a personal payer.
const DEFAULT_ALGOD_URL = 'https://testnet-api.algonode.cloud';
const DEFAULT_ALGOD_PORT = 443;
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
  const network = process.env.ALGO_NETWORK ?? DEFAULT_NETWORK;
  const algodClient = new algosdk.Algodv2(algodToken, algodUrl, algodPort);

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
    repState,
    ledger: [],
    deps: {
      settle: (to, amountAlgo, note) => submitTxn(payer, to, amountAlgo, note),
      anchorNote,
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
