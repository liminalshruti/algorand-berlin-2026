// x402 protocol types for Algorand (Sean lane · Berlin AlgoHack — "Agentic Commerce x402").
//
// Shaped to the official Algorand reference (algorandfoundation/x402-demo, @x402-avm v2): scheme
// "exact", CAIP-2 network ids, the PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSE header
// trio, and the client-signs / facilitator-submits settlement model. See
// docs/X402_OFFICIAL_COMPARISON.md for the full reconciliation.
//
// Flow: server answers an unpaid request with `402` + a PAYMENT-REQUIRED challenge ({ accepts[] });
// the client signs a payment authorization and returns it in PAYMENT-SIGNATURE; the facilitator
// verifies the authorization and settles it on-chain (instant finality), and the server returns the
// resource + a PAYMENT-RESPONSE settlement header.

export const X402_VERSION = 2;

/** "ALGO" for the native asset, or an ASA id (e.g. testnet USDC = 10458941). */
export type Asset = "ALGO" | number;

// CAIP-2 network ids — `algorand:<base64 genesis hash>`, matching the official reference.
export const ALGORAND_MAINNET = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
export const ALGORAND_TESTNET = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";
/** LocalNet's genesis hash is generated per network; this sentinel stands in for the demo. */
export const ALGORAND_LOCALNET = "algorand:localnet";
/** The offline mock chain. */
export const ALGORAND_MOCK = "algorand:mock";

export function networkId(network: "mainnet" | "testnet" | "localnet" | "mock"): string {
  switch (network) {
    case "mainnet":
      return ALGORAND_MAINNET;
    case "testnet":
      return ALGORAND_TESTNET;
    case "localnet":
      return ALGORAND_LOCALNET;
    case "mock":
      return ALGORAND_MOCK;
  }
}

/** The `402` challenge `accepts[]` entry. Mirrors the official PaymentRequirements, AVM-flavored. */
export interface PaymentRequirements {
  scheme: "exact";
  network: string; // CAIP-2, e.g. "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="
  /** Smallest-unit amount required (microAlgos for ALGO; the ASA's base units otherwise). */
  amount: number;
  /** Explicit asset (the official scheme resolves this from a `$` price; we carry it directly). */
  asset: Asset;
  /** The thing being bought — an opaque resource id (here: an agent read of a specific task). */
  resource: string;
  description: string;
  mimeType: string;
  /** Destination address (the serving agent's wallet). */
  payTo: string;
  /** Single-use challenge nonce. The authorization must bind to it; the facilitator consumes it once. */
  nonce: string;
  maxTimeoutSeconds: number;
}

/** The `PAYMENT-REQUIRED` header body. */
export interface PaymentRequired {
  x402Version: number;
  accepts: PaymentRequirements[];
}

/** The note/authorization binding — ties the payment to one resource + one challenge. */
export interface PaymentBinding {
  scheme: "exact";
  resource: string;
  nonce: string;
}

/**
 * The `PAYMENT-SIGNATURE` header body: a SIGNED-but-unsubmitted payment authorization. The
 * facilitator decodes `authorization`, verifies it against the requirements, and submits it.
 */
export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: {
    /** Payer address. */
    payer: string;
    /** base64 — a self-describing mock authorization, or a signed Algorand transaction blob. */
    authorization: string;
  };
}

/** Facilitator `/verify` result — does the authorization satisfy the requirements (no chain write)? */
export interface VerifyResponse {
  isValid: boolean;
  payer: string | null;
  invalidReason: string | null;
}

/** Facilitator `/settle` result — the on-chain outcome. Shape matches the official SettleResponse. */
export interface SettleResponse {
  success: boolean;
  /** On-chain transaction id when settled. */
  transaction: string | null;
  network: string;
  payer: string | null;
  /** ISO-8601 settlement time (block time when available). */
  settledAt: string | null;
  confirmedRound: number | null;
  errorReason: string | null;
}

// ── Header codecs (base64 JSON, matching @x402-avm/core/http) ─────────────────

export function encodePaymentRequiredHeader(value: PaymentRequired): string {
  return b64(value);
}
export function decodePaymentRequiredHeader(header: string): PaymentRequired {
  return unb64(header) as PaymentRequired;
}
export function encodePaymentSignatureHeader(value: PaymentPayload): string {
  return b64(value);
}
export function decodePaymentSignatureHeader(header: string): PaymentPayload {
  return unb64(header) as PaymentPayload;
}
export function encodePaymentResponseHeader(value: SettleResponse): string {
  return b64(value);
}
export function decodePaymentResponseHeader(header: string): SettleResponse {
  return unb64(header) as SettleResponse;
}

export function bindingFor(req: PaymentRequirements): PaymentBinding {
  return { scheme: "exact", resource: req.resource, nonce: req.nonce };
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}
function unb64(header: string): unknown {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}
