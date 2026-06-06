// Algorand anchor adapter (Sean lane · Berlin AlgoHack OKR "Algorand adapter").
//
// Pattern 3 (selective per-packet anchor) per the chain-anchor decision 2026-05-21. Anchor =
// a 0-ALGO self-payment whose 1KB note field carries ONLY the hash payload; verification pulls
// the txn back from the indexer and reads the note. Mechanics mirror the proven workspace adapter
// liminal-test/src/infra/algorand.ts; the Algorand client/account plumbing is shared with the
// x402 settlement layer via chain/algorand-client.ts (one substrate, two uses).

import {
  type AnchorChain,
  type AnchorNote,
  type AnchorReceipt,
  type Clock,
  NOTE_SCHEMA,
  type OnChainAnchor,
  systemClock,
} from "./types.ts";
import {
  type AlgoNetwork,
  type AlgorandConfig,
  type AlgoSdk,
  accountFor,
  algodFor,
  configFor,
  fetchTxn,
  loadAlgosdk,
} from "./algorand-client.ts";

export type { AlgoNetwork } from "./algorand-client.ts";

export class AlgorandAnchorChain implements AnchorChain {
  readonly chain = "algorand";
  readonly network: AlgoNetwork;

  private readonly cfg: AlgorandConfig;
  private readonly clock: Clock;

  constructor(network: AlgoNetwork = "testnet", clock: Clock = systemClock) {
    this.network = network;
    this.cfg = configFor(network);
    this.clock = clock;
  }

  async anchor(packetHash: string, canonicalVersion: string): Promise<AnchorReceipt> {
    const sdk: AlgoSdk = await loadAlgosdk();
    const client = algodFor(sdk, this.cfg);
    const account = await accountFor(sdk, this.cfg);

    const notePayload: AnchorNote = {
      schema: NOTE_SCHEMA,
      canonical_version: canonicalVersion,
      packet_hash: packetHash,
    };
    const note = new TextEncoder().encode(JSON.stringify(notePayload));

    const sp = await client.getTransactionParams().do();
    const txn = sdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: account.address,
      receiver: account.address,
      amount: 0,
      note,
      suggestedParams: sp,
    });
    const signed = txn.signTxn(account.sk);
    const { txid } = await client.sendRawTransaction(signed).do();
    const confirmed = await sdk.waitForConfirmation(client, txid, 6);
    const round = Number((confirmed as { confirmedRound?: number | bigint }).confirmedRound ?? 0);

    return {
      packet_hash: packetHash,
      canonical_version: canonicalVersion,
      anchor_txn_id: txid,
      anchored_at: this.clock(), // block-time fetch omitted; confirmation time is honest + sufficient
      chain: this.chain,
      network: this.network,
      verifier: {
        note_schema: NOTE_SCHEMA,
        confirmed_round: round,
        explorer_url: `https://lora.algokit.io/${this.network}/transaction/${txid}`,
        indexer_url: this.cfg.indexerUrl,
        genesis_id: this.cfg.genesisId,
      },
    };
  }

  async fetchAnchoredHash(txnId: string): Promise<OnChainAnchor | null> {
    const tx = await fetchTxn(this.cfg, txnId);
    if (!tx?.note) return null;
    const note = JSON.parse(Buffer.from(tx.note, "base64").toString("utf8")) as AnchorNote;
    return {
      packet_hash: note.packet_hash,
      canonical_version: note.canonical_version,
      anchored_at: tx.roundTime ? new Date(tx.roundTime * 1000).toISOString() : this.clock(),
      confirmed_round: tx.confirmedRound,
    };
  }
}
