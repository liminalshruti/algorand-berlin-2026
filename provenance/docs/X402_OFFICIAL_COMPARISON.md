# x402 — official Algorand reference vs ours (deep dive + reconciliation)

**Reference cloned to:** `~/clone-references/algorand/x402-demo` (`algorandfoundation/x402-demo`,
the Algorand Foundation's official "x402 on Algorand" demo, last updated 2026-05-12). Roles:
`client/` (fetch · axios · custom · advanced · mcp), `server/hono`, `facilitator/basic`. Built on
the published `@x402-avm/*` packages (`@x402-avm/core`, `@x402-avm/avm`, `@x402-avm/hono`,
`@x402-avm/fetch`, `@x402-avm/axios`) at v2.6.1, plus `@algorandfoundation/algokit-utils`.

This is the protocol-level comparison and the list of tweaks applied to make our slice
best-practice-aligned. Our two differentiators — the **bounded-agent settlement-refusal guard** and
**provenance anchoring of the delivered packet** — are layered *on top of* the standard protocol,
not in place of it.

## What the official reference establishes

| Concern | Official (`@x402-avm` / x402-demo) | Notes |
|---|---|---|
| **Scheme name** | `"exact"` | Network-namespaced; the full payment kind is `network` + `scheme`. |
| **Network id** | CAIP-2 `algorand:<base64 genesis hash>` | Testnet = `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=`. Clients register `"algorand:*"` wildcards. |
| **Roles** | Client · **Resource Server** · **Facilitator** (3 parties) | Server wraps routes with `paymentMiddleware`; the facilitator is a separate HTTP service. |
| **Two-phase** | Facilitator exposes `POST /verify`, `POST /settle`, `GET /supported` | Server verifies before serving, settles after. `VerifyResponse` / `SettleResponse`. |
| **Settlement model** | **Client signs, facilitator submits** | Client `createPaymentPayload` produces a *signed authorization*; the facilitator holds a signer and submits on-chain at settle. Gasless-style for the client. |
| **HTTP headers (v2)** | `PAYMENT-REQUIRED` (challenge), `PAYMENT-SIGNATURE` (client payment), `PAYMENT-RESPONSE` (settlement) | Not the v1 `X-PAYMENT` names. Challenge body is `{ x402Version, accepts: PaymentRequirements[] }`. |
| **Requirements fields** | `{ scheme, network, amount, payTo, description, mimeType, ... }` | Configured with a dollar `price` (`"$0.001"`) resolved to USDC by the scheme. |
| **Asset** | USDC ASA, resolved from `price`/scheme | Not hand-specified as raw microunits in the requirement. |
| **Settle response** | `{ success, transaction, network, payer, errorReason? }` | The client reads `transaction` / `payer` from `PAYMENT-RESPONSE`. |
| **Multi-chain** | `accepts[]` can list EVM/SVM/AVM; client selects | `selectPayment(version, requirements[])`. |
| **Facilitator hooks** | `onBefore/After Verify/Settle`, `onVerify/SettleFailure` | Used for payment tracking + bazaar discovery. |

## Where our first cut diverged, and the tweak applied

| # | Our first cut | Official best practice | Tweak applied |
|---|---|---|---|
| 1 | scheme `"algorand-exact"` | scheme `"exact"`, network-namespaced | → `"exact"` |
| 2 | network `"mock"` / `"algorand-testnet"` | CAIP-2 `algorand:<genesisHash>` | → `networkId()` helper; `ALGORAND_TESTNET`/`MAINNET` constants; `algorand:mock` for the offline chain |
| 3 | requirement field `maxAmountRequired` | `amount` | → renamed `amount` |
| 4 | one `SettlementChain` did pay+verify | **Payer** (client) vs **Facilitator** (verify/settle) split | → introduced `Payer` + `Facilitator` interfaces; gate calls `verify → serve → settle` |
| 5 | client **submits** the txn; server verifies it | client **signs** an authorization; facilitator **submits** | → `Payer.createPayment` returns a signed authorization; `Facilitator.settle` submits |
| 6 | header codecs `X-PAYMENT` style | `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` + `accepts[]` envelope | → renamed codecs; added the `PaymentRequired { accepts[] }` envelope |
| 7 | result `{ settled, txid, reason }` | `SettleResponse { success, transaction, network, payer, errorReason }` + `VerifyResponse { isValid, payer, invalidReason }` | → adopted both shapes |

## What we deliberately keep different (and why)

- **Explicit `asset` field on the requirement** (ALGO or ASA id). The official resolves the asset
  from a dollar `price` through the scheme's USDC config; we don't vendor their scheme, so we carry
  the asset explicitly. Wire-compatible in spirit; documented divergence.
- **Resource/nonce binding in the transaction note.** We bind each payment to `{resource, nonce}`
  via the note and consume the nonce once (replay protection). The official scheme binds via its
  signed-authorization structure; the note-binding is our equivalent and is also what the
  provenance layer reads.
- **Settlement-refusal guard + provenance anchor.** Pure Liminal additions on top of the standard:
  out-of-lane work is refused *before* any 402 (free, names the right agent), and a settled
  delivery is anchored so the buyer gets *paid-here, proven-here*. These are the Berlin thesis.
- **No vendored facilitator/sponsored fees.** The official `ExactAvmScheme` can sponsor fees
  (true gasless) via fee-pooling inside the published package. We implement client-signs /
  facilitator-submits with the payer covering the txn fee, and note sponsored-fee pooling as the
  upstream extension rather than reimplementing it. For a production Berlin entry, depending on
  `@x402-avm/*` directly (as the official server/facilitator do) is the right call — this slice
  is the self-contained, offline-runnable reference that shows we implement the protocol correctly.

## If we were to ship on the published packages

The cleanest production path mirrors the official repo exactly: a `@x402-avm/hono` resource server
whose `paymentMiddleware` fronts each agent's `/api/read`, pointed at a facilitator (self-hosted
`@x402-avm/core/facilitator` with `ExactAvmScheme`, or the hosted `facilitator.goplausible.xyz`).
Our `PricedEndpoint` guard logic (free refusal → no 402) becomes a thin wrapper that decides
*whether* to apply `paymentMiddleware` per request, and the provenance anchor runs in an
`onAfterSettle` hook. The protocol surface in this slice is shaped to make that swap mechanical.
