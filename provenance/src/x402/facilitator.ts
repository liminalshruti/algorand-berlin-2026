// x402 Payer + Facilitator (Sean lane · Berlin AlgoHack).
//
// The official Algorand reference (algorandfoundation/x402-demo) splits settlement into two roles:
//   · Payer (client)     — signs a payment authorization; does NOT submit it.
//   · Facilitator        — verify(payload, req) validates the authorization off-chain;
//                          settle(payload, req) submits it on-chain and reports the result.
// The resource server (our PricedEndpoint) calls verify before serving and settle after.
//
// The authorization is self-describing { to, amount, asset, resource, nonce } plus, on a real
// network, the signed Algorand transaction blob. The facilitator checks the declared intent against
// the requirements, submits the signed txn, then confirms on-chain that it landed as declared. The
// payment note binds {resource, nonce} so it can't be replayed for a different resource, and the
// facilitator consumes each nonce/txn once.
//
// Mock (default): no network, deterministic. Algorand: real localnet/testnet via the shared client.

import { type Clock, systemClock } from "../chain/types.ts";
import {
  type AlgoNetwork,
  type AlgorandConfig,
  type AlgoSdk,
  accountFor,
  algodFor,
  configFor,
  fetchTxn,
  loadAlgosdk,
} from "../chain/algorand-client.ts";
import {
  type Asset,
  type PaymentPayload,
  type PaymentRequirements,
  type SettleResponse,
  type VerifyResponse,
  X402_VERSION,
  bindingFor,
  networkId,
} from "./types.ts";
import { createHash } from "node:crypto";

export interface Payer {
  readonly address: string;
  readonly network: string;
  /** Sign a payment authorization for the requirement. Does NOT submit it. */
  createPayment(req: PaymentRequirements): Promise<PaymentPayload>;
}

export interface Facilitator {
  readonly network: string;
  /** Validate an authorization against the requirements — no chain write. */
  verify(payload: PaymentPayload, req: PaymentRequirements): Promise<VerifyResponse>;
  /** Submit the authorization on-chain. Replay-safe (rejects re-settling a txn or reusing a nonce). */
  settle(payload: PaymentPayload, req: PaymentRequirements): Promise<SettleResponse>;
  /** Supported (network, scheme) pairs — mirrors the facilitator `GET /supported`. */
  supported(): { network: string; scheme: string }[];
}

/** The decoded authorization carried (base64) in PaymentPayload.payload.authorization. */
interface Authorization {
  to: string;
  amount: number;
  asset: Asset;
  resource: string;
  nonce: string;
  /** base64 signed Algorand transaction blob (real networks only). */
  signedTxn?: string;
}

/** Resource-server helper: read the challenge fields back from a payment (to match the issued 402). */
export function peekAuthorization(
  payload: PaymentPayload,
): { payer: string; to: string; amount: number; asset: Asset; resource: string; nonce: string } | null {
  const a = decodeAuth(payload.payload.authorization);
  if (!a) return null;
  return { payer: payload.payload.payer, to: a.to, amount: a.amount, asset: a.asset, resource: a.resource, nonce: a.nonce };
}

function encodeAuth(a: Authorization): string {
  return Buffer.from(JSON.stringify(a), "utf8").toString("base64");
}
function decodeAuth(b64: string): Authorization | null {
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Authorization;
  } catch {
    return null;
  }
}

// Common off-chain validation of an authorization against requirements.
function checkAuthorization(auth: Authorization | null, req: PaymentRequirements): string | null {
  if (!auth) return "malformed authorization";
  if (auth.to !== req.payTo) return "wrong receiver";
  if (auth.asset !== req.asset) return "wrong asset";
  if (auth.amount < req.amount) return "underpayment";
  if (auth.resource !== req.resource || auth.nonce !== req.nonce) {
    return "binding mismatch: authorization not bound to this resource/nonce";
  }
  return null;
}

class ReplayGuard {
  private readonly txids = new Set<string>();
  private readonly nonces = new Set<string>();
  seen(txid: string, nonce: string): string | null {
    if (this.txids.has(txid)) return "replay: transaction already settled";
    if (this.nonces.has(nonce)) return "replay: challenge nonce already consumed";
    return null;
  }
  consume(txid: string, nonce: string): void {
    this.txids.add(txid);
    this.nonces.add(nonce);
  }
}

// ── Mock: in-memory, deterministic, no network ───────────────────────────────

export class MockPayer implements Payer {
  readonly address: string;
  readonly network = networkId("mock");
  constructor(address = "MOCKPAYERADDRESS") {
    this.address = address;
  }
  async createPayment(req: PaymentRequirements): Promise<PaymentPayload> {
    const auth: Authorization = {
      to: req.payTo,
      amount: req.amount,
      asset: req.asset,
      resource: req.resource,
      nonce: req.nonce,
    };
    return {
      x402Version: X402_VERSION,
      scheme: "exact",
      network: this.network,
      payload: { payer: this.address, authorization: encodeAuth(auth) },
    };
  }
}

export class MockFacilitator implements Facilitator {
  readonly network = networkId("mock");
  private readonly clock: Clock;
  private readonly guard = new ReplayGuard();
  private round = 2000;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  async verify(payload: PaymentPayload, req: PaymentRequirements): Promise<VerifyResponse> {
    const auth = decodeAuth(payload.payload.authorization);
    const reason = checkAuthorization(auth, req);
    return { isValid: reason === null, payer: payload.payload.payer, invalidReason: reason };
  }

  async settle(payload: PaymentPayload, req: PaymentRequirements): Promise<SettleResponse> {
    const payer = payload.payload.payer;
    const auth = decodeAuth(payload.payload.authorization);
    const reason = checkAuthorization(auth, req);
    if (reason) return fail(this.network, payer, reason);

    const txid = mockTxId(payer, req);
    const replay = this.guard.seen(txid, req.nonce);
    if (replay) return fail(this.network, payer, replay);

    this.guard.consume(txid, req.nonce);
    return {
      success: true,
      transaction: txid,
      network: this.network,
      payer,
      settledAt: this.clock(),
      confirmedRound: ++this.round,
      errorReason: null,
    };
  }

  supported(): { network: string; scheme: string }[] {
    return [{ network: this.network, scheme: "exact" }];
  }
}

// ── Algorand: real localnet / testnet ────────────────────────────────────────

export class AlgorandPayer implements Payer {
  readonly network: string;
  private readonly cfg: AlgorandConfig;
  private cachedAddress: string | null = null;

  constructor(network: AlgoNetwork = "testnet") {
    this.cfg = configFor(network);
    this.network = networkId(network);
  }

  get address(): string {
    return this.cachedAddress ?? "(unresolved — call createPayment first)";
  }

  async createPayment(req: PaymentRequirements): Promise<PaymentPayload> {
    const sdk: AlgoSdk = await loadAlgosdk();
    const client = algodFor(sdk, this.cfg);
    const account = await accountFor(sdk, this.cfg);
    this.cachedAddress = account.address;

    const note = new TextEncoder().encode(JSON.stringify(bindingFor(req)));
    const sp = await client.getTransactionParams().do();
    const txn =
      req.asset === "ALGO"
        ? sdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: account.address,
            receiver: req.payTo,
            amount: req.amount,
            note,
            suggestedParams: sp,
          })
        : sdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            sender: account.address,
            receiver: req.payTo,
            amount: req.amount,
            assetIndex: req.asset,
            note,
            suggestedParams: sp,
          });

    // Sign WITHOUT submitting — the facilitator submits at settle (official client-signs model).
    const signed: Uint8Array = txn.signTxn(account.sk);
    const auth: Authorization = {
      to: req.payTo,
      amount: req.amount,
      asset: req.asset,
      resource: req.resource,
      nonce: req.nonce,
      signedTxn: Buffer.from(signed).toString("base64"),
    };
    return {
      x402Version: X402_VERSION,
      scheme: "exact",
      network: this.network,
      payload: { payer: account.address, authorization: encodeAuth(auth) },
    };
  }
}

export class AlgorandFacilitator implements Facilitator {
  readonly network: string;
  private readonly cfg: AlgorandConfig;
  private readonly clock: Clock;
  private readonly guard = new ReplayGuard();

  constructor(network: AlgoNetwork = "testnet", clock: Clock = systemClock) {
    this.cfg = configFor(network);
    this.network = networkId(network);
    this.clock = clock;
  }

  async verify(payload: PaymentPayload, req: PaymentRequirements): Promise<VerifyResponse> {
    const auth = decodeAuth(payload.payload.authorization);
    let reason = checkAuthorization(auth, req);
    if (!reason && !auth?.signedTxn) reason = "missing signed transaction";
    return { isValid: reason === null, payer: payload.payload.payer, invalidReason: reason };
  }

  async settle(payload: PaymentPayload, req: PaymentRequirements): Promise<SettleResponse> {
    const payer = payload.payload.payer;
    const auth = decodeAuth(payload.payload.authorization);
    const reason = checkAuthorization(auth, req);
    if (reason) return fail(this.network, payer, reason);
    if (!auth?.signedTxn) return fail(this.network, payer, "missing signed transaction");

    const sdk: AlgoSdk = await loadAlgosdk();
    const client = algodFor(sdk, this.cfg);
    const blob = new Uint8Array(Buffer.from(auth.signedTxn, "base64"));

    // Derive the txid up front for replay protection.
    const decoded = sdk.decodeSignedTransaction(blob);
    const txid = decoded.txn.txID();
    const replay = this.guard.seen(txid, req.nonce);
    if (replay) return fail(this.network, payer, replay);

    await client.sendRawTransaction(blob).do();
    await sdk.waitForConfirmation(client, txid, 6);

    // Confirm on-chain that it landed as declared (receiver, amount, note binding).
    const tx = await fetchTxn(this.cfg, txid);
    if (!tx || tx.receiver !== req.payTo || tx.amount === null || tx.amount < req.amount) {
      return fail(this.network, payer, "on-chain confirmation did not match requirements");
    }

    this.guard.consume(txid, req.nonce);
    return {
      success: true,
      transaction: txid,
      network: this.network,
      payer,
      settledAt: tx.roundTime ? new Date(tx.roundTime * 1000).toISOString() : this.clock(),
      confirmedRound: tx.confirmedRound,
      errorReason: null,
    };
  }

  supported(): { network: string; scheme: string }[] {
    return [{ network: this.network, scheme: "exact" }];
  }
}

function fail(network: string, payer: string | null, reason: string): SettleResponse {
  return { success: false, transaction: null, network, payer, settledAt: null, confirmedRound: null, errorReason: reason };
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function mockTxId(payer: string, req: PaymentRequirements): string {
  const digest = createHash("sha256")
    .update(`${req.resource}|${req.nonce}|${payer}|${req.payTo}|${req.amount}`)
    .digest();
  let out = "";
  for (let i = 0; i < 52; i++) out += BASE32[digest[i % digest.length]! % 32];
  return out;
}
