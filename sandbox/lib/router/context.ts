import algosdk from 'algosdk';
import crypto from 'crypto';
import type { AlgoAccount, Ctx, RepState } from './contract.js';

const ALGOD_URL   = process.env.ALGOD_URL   ?? 'http://localhost';
const ALGOD_PORT  = Number(process.env.ALGOD_PORT  ?? 4001);
const ALGOD_TOKEN = process.env.ALGOD_TOKEN ?? 'a'.repeat(64);
const NETWORK     = process.env.ALGO_NETWORK ?? 'localnet';

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

export async function buildContext(repState: RepState = stubRepState): Promise<Ctx> {
  const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, ALGOD_PORT);

  const payer       = loadAccount(process.env.PAYER_MNEMONIC);
  const facilitator = loadAccount(process.env.FACILITATOR_MNEMONIC);
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
    return { txid, round: Number(confirmed['confirmed-round']) };
  }

  async function anchorNote(
    ref_id: string,
    schema: string,
    hash: string,
  ): Promise<{ txid: string; round: number }> {
    return submitTxn(payer, payer.addr, 0, { schema, ref_id, hash });
  }

  return {
    net: NETWORK,
    store: algodClient,
    session: { payer, facilitator, funded },
    providers: new Map(),
    routeStore: new Map(),
    paymentStore: new Map(),
    repState,
    ledger: [],
    deps: {
      settle: (to, amountAlgo, note) => submitTxn(payer, to, amountAlgo, note),
      anchorNote,
      buildReputationEntry: (provider_id, score) => ({ provider_id, score }),
      anchorReputationEntry: async (entry) => {
        const hash = crypto
          .createHash('sha256')
          .update(JSON.stringify(entry))
          .digest('hex');
        const { txid } = await anchorNote('reputation', 'algorand-rep-v1', hash);
        return txid;
      },
      explorerFor: (txid) =>
        NETWORK === 'mainnet'
          ? `https://allo.info/tx/${txid}`
          : `https://app.dappflow.org/explorer/transaction/${txid}`,
    },
  };
}
