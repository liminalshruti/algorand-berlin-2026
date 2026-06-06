# Build Checklist - x402 Trust Router

**Date:** 2026-06-06 · **Server:** `sandbox/bin/router-server.ts`

This is the active status tracker. It is organized by work remaining, verification evidence, and the
person responsible for updating each row.

Legend: `[x]` done · `[ ]` left · `Owner` is who should update the row when it changes.

## Core Demo Loop

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Router server boots on `:3001` | Navid | `npm start`; Hono server in `sandbox/bin/router-server.ts` |
| [x] | Seed 3 Diligence demo providers | Reza/Navid | `sandbox/lib/router/seed.ts` |
| [x] | Demo provider discovery by register | Reza | `GET /api/providers?register=Diligence`; seeded providers only |
| [x] | Route task and store route | Reza | `POST /api/route`; writes `ctx.routeStore` |
| [x] | Router-settled demo payment | Navid | `POST /api/pay`; writes `ctx.paymentStore`; router acts as demo payer |
| [x] | Settle honest provider at quote | Navid | `settled_amount == quoted_amount`; 1 txid |
| [x] | Settle cheat provider with hidden fee | Navid | `settled_amount > quoted_amount`; extra txid |
| [x] | Anchor payment ledger entries | Navid | `GET /api/ledger` |
| [x] | Validate payment against quote | Shayaun | `POST /api/validate`; `price_match` |
| [x] | Update reputation after verdict | Shayaun | `ctx.repState`; `GET /api/reputation` |
| [x] | Re-route after failed verdict | Reza/Shayaun | `/api/route` reads updated reputation |
| [x] | Surface loop in frontend | Shruti | `public/router.html` + `public/router.js` |

## Discovery Proxy / Tool Catalog

This is the next product shape: the router acts as a trust-aware discovery proxy. It aggregates
ARC-8004 identity records, MCP servers, A2A agent cards, and local/demo providers; normalizes them into
service/tool groups; then routes by requested service instead of a single `register` string.

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Demo discovery primitive | Reza | In-memory providers + `register` filter in `providers.ts` |
| [ ] | Define service/tool schema | Reza | Demo fields only: `service_id`, name, description, endpoint, provider ids, quote amount, asset, `payTo` |
| [ ] | Provider registration/intake | Reza | Accept or discover `agent_uri`, provider wallet, x402 support, MCP/A2A endpoints |
| [ ] | Parse ARC-8004 agent registration files | Reza | Resolve `agent_uri`; read `services[]`, `x402Support`, `supportedTrust`, wallet/service endpoints |
| [ ] | Verify provider payment wallet | Reza/Navid | Resolve `agentWallet` or `algorand-wallet`; ensure x402 `payTo` matches provider wallet |
| [ ] | Add MCP capability adapter | Reza | Ingest MCP server metadata/tool list names/descriptions into the shared service schema |
| [ ] | Add A2A capability adapter | Reza | Ingest A2A agent card capability names/descriptions into the shared service schema |
| [ ] | Add local/demo provider adapter | Reza | Preserve current seeded providers as one adapter source |
| [ ] | Semantic grouping | Reza | Cluster/normalize capabilities into available service/tool categories |
| [ ] | Expose tool catalog endpoint | Reza/Shruti | `GET /api/tools` or `GET /api/services` returns grouped services with providers |
| [ ] | Route by service/tool intent | Reza | `POST /api/route` accepts `service_id` or inferred intent, not only `register` |
| [ ] | Include trust/payment metadata in catalog | Reza/Shayaun/Navid | Each tool group exposes reputation, validation rate, quote amount, asset, `payTo`, provider id |
| [ ] | Add discovery tests | Reza | ARC-8004/MCP/A2A/local fixtures, grouping, unsupported service, route-by-service |

Minimal demo listing metadata: `service_id`, `provider_id`, `quote_id`, amount, asset, `payTo`,
`observed_at`, `expires_at`. Discovery stores facts; quote policy decides whether a listing is fresh
enough to route. No signatures, dynamic pricing, or advanced policy fields are in demo scope.

## Target No-Custody x402 Flow

The target demo flow is discovery-proxy-first and payment-noncustodial: users call our proxy service
description, the router chooses the concrete provider, but the x402 payment still goes directly from
the client agent to the selected provider wallet.

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [ ] | Define proxy invocation shape | Reza/Navid | Client calls our service/tool endpoint; request carries `service_id` or task intent |
| [ ] | Add quote policy layer | Reza/Navid | Convert fresh listing metadata into an active quote commitment before routing |
| [ ] | Select concrete provider by trust + price | Reza/Shayaun | Selection reads reputation, validation rate, quote, and availability |
| [ ] | Forward provider x402 challenge | Navid/Reza | Return provider `402 PaymentRequirements` with provider `payTo`; router does not settle or custody funds |
| [ ] | Preserve challenge correlation | Navid | Carry `route_id`, `provider_id`, active `quote_id`, x402 `nonce`, `resource`, amount, asset, network |
| [ ] | Record quote-vs-challenge mismatch | Navid/Reza | Compare active quote commitment to provider `402 PaymentRequirements`; do not block the happy-flow payment |
| [ ] | Decide post-payment invocation path | Reza/Navid | Either client calls provider directly, or client calls proxy with proof and proxy forwards the request |
| [ ] | Capture payment proof | Navid | Store txid/nonce/payer/provider/amount/asset after client payment settles |
| [ ] | Verify proof off-chain | Navid/Shayaun | Confirm txid paid selected provider wallet; reject replay or mismatched payer/provider |
| [ ] | Trigger automatic validation for dishonesty | Shayaun/Reza | Hidden fee, wrong `payTo`, invalid challenge, replay, or timeout creates validation evidence without user feedback |
| [ ] | Automatic validation updates reputation | Shayaun | `/api/validate` or successor writes validation result into in-memory reputation and validation/anchor evidence |
| [ ] | Feedback endpoint | Shayaun | `POST /api/feedback` or extended `/api/validate` accepts proof + satisfaction/verdict |
| [ ] | One feedback per proof | Shayaun/Navid | Dedupe by `paymentTxid` + `nonce` |
| [ ] | User-triggered reputation update | Shayaun | Update in-memory score and env-gated on-chain `giveFeedback` using payment proof + feedback |
| [ ] | Active validation / attestation path | Shayaun/Reza | Future validators can test a provider and award reputation through attestations, including optional ZK proofs |
| [ ] | UI shows direct-payment proof | Shruti | Catalog/route/pay flow shows selected provider wallet, txid, nonce, and feedback status |

Reputation has three input classes in the target flow: payment-backed user feedback, automatic
validations for objectively captured dishonesty, and future active validations/attestations. Hidden-fee
detection means the x402 challenge violates an active quote commitment; it is validation, not feedback.
The TestNet happy flow lets the payment settle, then validates the mismatch using the proof.

## Contracts And Registry Surface

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Identity registry contract | Reza | `smart_contracts/identity_registry/*` |
| [x] | Reputation registry contract | Shayaun | `smart_contracts/reputation_registry/*` |
| [x] | Validation registry contract | Shayaun | `smart_contracts/validation_registry/*` |
| [x] | Generated clients/artifacts | Reza/Shayaun | `smart_contracts/artifacts/*` |
| [x] | LocalNet deploy path | Navid | `npm run build && npm run deploy:localnet` |
| [x] | Env-gated on-chain reputation write | Shayaun | `sandbox/lib/router/onchain.ts::maybeWriteReputation` |
| [ ] | Split validation from user feedback chain writes | Shayaun | Hidden-fee verdicts use validation/anchor evidence; `giveFeedback` is for user satisfaction |
| [ ] | Add x402 `paymentTxid` + `nonce` to `giveFeedback` | Shayaun | Update contract, regenerate client, pass through `onchain.ts` |
| [ ] | Confirm public TestNet registry app ids for pitch | Shayaun/Navid | Deploy or document LocalNet-only proof |

## Frontend And Narrative

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Trust Router page consumes live API | Shruti | `POST /api/route`, `/pay`, `/validate`; ledger/reputation reads |
| [x] | Mock fallback remains available | Shruti | Per-endpoint fallback in `public/router.js` |
| [x] | Marketplace/Studio/Contracts/Admin pages exist | Shruti | `public/*.html`, `registry.js`, `arc8004.js` |
| [x] | Pitch script, deck outline, storyboard | Shruti | `pitch/` |
| [ ] | Keep non-router console pages mock-first unless backend endpoints are added | Shruti | No raw registry backend endpoints yet |
| [ ] | Update pitch/storyboard for target no-custody flow | Shruti/Navid | Current pitch artifacts describe the router-settled demo payer path |

## Cleanup / Consistency

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Reduce markdown surface | Reza | Active docs listed in `README.md` |
| [x] | Remove stale H0 planning/spec docs | Reza | Deleted pre-build specs and logistics docs |
| [ ] | Decide whether `sandbox/lib/router/ranking.ts` is wired or deleted | Reza/Navid | Active ranking is `providers.ts::discoveryOptions` |
| [ ] | Keep `INTEGRATION_HANDOFF.md` current as code changes land | Everyone | Endpoint signatures, shared Maps, and blockers only |

## Verification Checklist

Run before calling the current build demo-ready:

- [ ] `npm test`
- [ ] `npm run test:contracts`
- [ ] `npm run check-types`
- [ ] `npm start`
- [ ] Honest provider: `settled_amount == quoted_amount`
- [ ] Cheat provider: `settled_amount > quoted_amount`
- [ ] `/api/validate` lowers the cheat provider reputation
- [ ] Re-running `/api/route` avoids the caught provider
- [ ] `/api/ledger` contains hash-only anchors with explorer-ready txids
- [ ] Discovery catalog groups at least one service with multiple providers
- [ ] Route request can target a service/tool, not just `register=Diligence`
- [ ] Target flow forwards provider x402 challenge with provider wallet as `payTo`
- [ ] Quote policy pins a fresh listing into an active quote commitment
- [ ] Target flow records quote-vs-challenge drift without blocking payment
- [ ] Automatic validation can lower reputation without user feedback
- [ ] Future active validation/attestation path is represented in docs or code
- [ ] Target flow accepts feedback only with valid `paymentTxid` + `nonce`

## Guardrails

- Read `INTEGRATION_HANDOFF.md` before writing code.
- Do not touch `sandbox/bin/berlin-server.js`.
- Do not touch any `sandbox/lib/x402/*` file.
- Treat `sandbox/lib/router/contract.ts` as frozen shared API unless the integration owner explicitly
  approves a contract change.
- Keep route handlers in route factories; `router-server.ts` composes them.
