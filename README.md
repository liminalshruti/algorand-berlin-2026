# x402 Trust Router + ARC-8004 on Algorand

**Algorand Builders Berlin 2026 · Agentic Commerce x402 · Infrastructure track.**

A trust router over x402 on Algorand where agent reputation is earned and verified, not
self-reported: discover agent services, group equivalent capabilities into a tool catalog, choose a
provider by price + earned reputation + validation, anchor payment-backed feedback and automatic
validation outcomes, then route around providers that get caught charging hidden fees.

> "ERC-8004 gives agents a passport; we give the marketplace a conscience."

## Source Of Truth

- `INTEGRATION_HANDOFF.md` - live team handoff, endpoint signatures, shared Maps, open follow-ups.
- `BUILD_CHECKLIST_2026-06-06.md` - current done/left tracker, owners, and verification gates.
- `ref/END_TO_END_HACK_SCOPE_2026-06-06.md` - demo spine, scope, honesty register, next moves.
- `public/README.md` - frontend pages and live/mock wiring.
- `pitch/` - script, deck outline, and demo storyboard.
- `ref/ERC8004_AVM_MAPPING.md` + `ref/ARC-8004.md` - standards/reference material.

Old pre-Berlin logistics, H0 implementation specs, and prior Liminal-substrate positioning docs have
been removed from the active markdown surface.

## Current Architecture

| Layer | Where | What |
|---|---|---|
| Frontend | `public/` | 5-page vanilla JS/CSS console: Trust Router, Marketplace, Agent Studio, Contracts, Admin. Trust Router calls the live API with per-endpoint mock fallback. |
| Router server | `sandbox/` | Hono server on `:3001`. Routes discovery, payment, validation, reputation, ledger, and provider listing. Defaults to TestNet. |
| On-chain | `smart_contracts/` | Algorand TypeScript Identity, Reputation, and Validation registries with deploy configs, generated clients, unit specs, and LocalNet e2e. |

Live API:

```txt
POST /api/route       { task, register } -> { route_id, task, register, options }
POST /api/pay         { route_id, option_id } -> { payment_id, txids, quoted_amount, settled_amount, read }
POST /api/validate    { payment_id } -> { validation_id, price_match, output_pass, response, new_reputation, verdict_txid }
GET  /api/reputation?provider=... -> { provider_id, score, reads_logged, corrections_logged, by_tag, uri, hash }
GET  /api/ledger      -> { anchors }
GET  /api/providers   -> { register, providers }
```

## Run It

Frontend only:

```sh
npx serve public
```

Open the served `router.html`. The frontend can run fully on mocks.

Full stack, TestNet default:

```sh
npm install
npm start
```

`npm start` boots `sandbox/bin/router-server.ts` on `:3001`, seeds the demo providers, funds them from
the shared throwaway TestNet payer, and returns real on-chain txids. Fund the payer first; the address
and dispenser command live in `INTEGRATION_HANDOFF.md`.

LocalNet option:

```sh
npm run localnet:start
ALGO_NETWORK=localnet npm start
```

Use a funded `PAYER_MNEMONIC` in `.env` for LocalNet.

Contracts:

```sh
npm run build
npm run deploy:localnet
npm run test:contracts
tsx localnet-e2e.ts
```

## Demo Beat

1. Route a diligence task and show three ranked providers.
2. The cheapest provider wins.
3. Pay over x402 on Algorand.
4. Provider returns an x402 challenge that is higher than the active quote commitment.
5. Payment settles for the challenge amount; automatic validation catches the quote drift and writes
   reputation down.
6. Re-run the same request; the router routes to an honest provider.
7. Show the hash-only ledger anchors and explorer links.

## Status

- Frontend console is landed with live endpoint wiring and mock fallback.
- Payment + ledger are landed and verified with real txids.
- Demo provider discovery is landed; full ARC-8004/MCP/A2A service discovery is still open.
- Reputation + validation routes are landed; validation updates in-memory reputation and anchors
  verdicts. Env-gated on-chain `giveFeedback` is wired.

Known follow-ups:

- Add mandatory x402 `paymentTxid` + `nonce` to on-chain `giveFeedback` and pass them through
  `sandbox/lib/router/onchain.ts`.
- Replace router-settled demo payment with target no-custody x402 challenge forwarding: the router
  chooses the provider, but the client pays the provider wallet directly.
- Add service/tool catalog discovery from ARC-8004 registration files, MCP metadata, and A2A agent
  cards.
- Add the minimal demo quote policy layer: crawled listings carry `service_id`, `provider_id`,
  `quote_id`, amount, asset, `payTo`, `observed_at`, and `expires_at`; routing pins a fresh listing into
  an active quote commitment.
- Split reputation signals into user feedback and automatic validations. Quote drift means the x402
  challenge violates the active quote commitment; payment can still settle, then validation uses the
  proof to write reputation down. Future active validations can let providers earn reputation through
  validator attestations.
- `sandbox/lib/router/ranking.ts` is not the active ranking implementation; routing currently ranks in
  `sandbox/lib/router/providers.ts::discoveryOptions`.
- Marketplace, Studio, Contracts, and Admin are mock-first for raw registry operations; the Trust
  Router page consumes the live backend API.

## Verify

```sh
npm test
npm run test:contracts
npm run check-types
```
