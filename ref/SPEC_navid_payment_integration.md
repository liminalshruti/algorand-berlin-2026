# SPEC — Navid · Payment + Integration harness

**Lane:** the x402 settlement layer (out of ERC-8004 scope) + the harness that merges all lanes.
**Owns:** `bin/router-server.js`, `lib/router/pay.js`, `lib/router/context.js`, `lib/router/contract.js` *(H0 only)*
**Role:** integration owner.

## Abstract

Build the payment layer that settles a chosen provider over x402 on Algorand and produces the on-chain
evidence the Validation Registry consumes, plus the server harness that composes every lane's routes
into one process.

## Motivation

ERC-8004 deliberately leaves payment out of scope; the trust loop still needs real on-chain settlement
to validate against. And four engineers need one server without co-editing it — a merge harness +
shared `ctx` makes that possible.

## Specification

### `lib/router/contract.js` (write at H0, then frozen)
The shared types + constants in `00_OVERVIEW.md`. Commit first so everyone has green imports.

### `lib/router/context.js`
```js
buildContext(net, session) → ctx
// ctx = { net, store, session:{payer,facilitator,funded}, providers,
//         routeStore:Map, paymentStore:Map, repState, ledger:[],
//         deps:{ anchorNote, buildReputationEntry, anchorReputationEntry, explorerFor } }
```

### `lib/router/pay.js`
```js
payProvider(ctx, provider, option) → PaymentResult
// PaymentResult = { payment_id, provider_id, quoted, settled, txids:[], read }
```
- Issue the 402 at `provider.quote`; settle via `ctx.session.payer` + `ctx.session.facilitator`
  (reuse existing `lib/x402/*` primitives — do not modify them).
- **Honest provider:** settle `quote` → `settled == quoted`, 1 txid.
- **Dishonest provider (`provider.dishonest`):** settle `quote` **plus a real second hidden-fee
  settlement** → `settled > quoted`, 2 txids. This is the demo's "hidden fee at checkout."
- Write the result into `ctx.paymentStore[payment_id]` and push a `pay` entry to `ctx.ledger`.
- `makePayRoutes(ctx) → { "POST /api/pay", "GET /api/ledger" }`.

### `bin/router-server.js`
- Import the base x402 server's route table; build `ctx`; merge
  `{ ...baseRoutes, ...makeProviderRoutes(ctx), ...makePayRoutes(ctx), ...makeValidationRoutes(ctx) }`
  into a fresh HTTP server (re-declare the tiny `json`/`readBody` helpers locally — keep the base
  server file untouched). Boot on LocalNet by default.

## Rationale

x402 settlement is the discrete on-chain artifact that makes validation objective (settled-vs-quoted is
verifiable). The `ctx` object centralizes shared state so route logic stays distributed across owners.

## Security / Risk Considerations

- Demo payer key is env-only. Nonce-bound resources prevent replay (already in the x402 primitives).
- In-memory stores are fine for the demo (no TTL/DB).
- Latency: per-call settle adds time — LocalNet is instant; batch if needed.

## Definition of Done

- `node bin/router-server.js` boots on LocalNet and prints the merged route table.
- `POST /api/pay` returns real txid(s); `GET /api/ledger` lists anchored events.
- The base x402 server file is unmodified (`git diff` empty for it).

## QA — success criteria (run before PR)

- [ ] honest provider → `settled == quoted`, exactly 1 txid, confirmed.
- [ ] dishonest provider → `settled > quoted`, 2 txids, both confirmed on-chain.
- [ ] unknown `route_id`/`option_id` → 400, **no** settlement occurs.
- [ ] replaying a consumed option/nonce → rejected.
- [ ] each ledger entry = `{txid, schema, hash, round}` only (no content leak).
- [ ] `contract.js` unchanged since H0; base server file untouched.

## Dependencies

- **Consumes:** `ctx.routeStore` (ranked options, from Reza).
- **Produces:** `ctx.paymentStore` (read by Shayaun's validation). Owns `contract.js` + the harness.
