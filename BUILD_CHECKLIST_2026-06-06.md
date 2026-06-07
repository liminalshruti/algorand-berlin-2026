# Build Checklist - x402 Trust Router

**Date:** 2026-06-06 · **Server:** `apps/router/bin/router-server.ts`

This is the active status tracker. It is organized by work remaining, verification evidence, and the
person responsible for updating each row.

Legend: `[x]` done · `[ ]` left · `Owner` is who should update the row when it changes.

## Core Demo Loop

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Router server boots on `:3001` | Navid | `npm start`; Hono server in `apps/router/bin/router-server.ts` |
| [x] | Seed 3 Diligence demo agents | Reza/Navid | `apps/router/src/seed.ts` |
| [x] | Demo agent discovery by service | Reza | `GET /api/agents`; seeded identities + resolved MCP service |
| [x] | Route task and store route | Reza | `POST /api/route`; writes `ctx.routeStore` |
| [x] | Router-settled demo payment | Navid | `POST /api/pay`; writes `ctx.paymentStore`; router acts as demo payer |
| [x] | Settle honest agent at quote | Navid | `settled_amount == quoted_amount`; 1 txid |
| [x] | Settle quote drift above active quote | Navid | `settled_amount > quoted_amount`; quote-drift verdict |
| [x] | Anchor payment ledger entries | Navid | `GET /api/ledger` |
| [x] | Validate payment against quote | Shayaun | `POST /api/validate`; `price_match` |
| [x] | Update reputation after verdict | Shayaun | `ctx.repState`; `GET /api/reputation` |
| [x] | Re-route after failed verdict | Reza/Shayaun | `/api/route` reads updated reputation |
| [x] | Surface loop in frontend | Shruti | `apps/web/router.html` + `apps/web/router.js` |

## Discovery Proxy / Tool Catalog

This is the next product shape: the router acts as a trust-aware discovery proxy. It aggregates
ARC-8004 identity records, MCP servers, A2A agent cards, and local/demo agents; normalizes them into
service/tool groups; then routes by requested service instead of a single `register` string.

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Demo discovery primitive | Reza | In-memory agents + `register` filter in `agents.ts` |
| [x] | Define service/tool schema | Reza | Demo fields only: `service_id`, `agent_id`, protocol, endpoint, name |
| [x] | Agent registration/intake | Reza | Honest/Cheat cards in `docs/agents/testnet/`; `ingestAgentCardsFromManifest` |
| [x] | Parse ARC-8004 agent registration files | Reza | `agents.ts::parseAgentCard`; reads clean `services[]`, MCP endpoint, wallet, x402/active flags |
| [x] | Route-time demo quote adapter | Reza/Navid | Card-backed Honest/Cheat quotes are pre-probed into `ctx.quoteCache`; Cheat execution 402 requests 0.06 vs 0.04 quoted |
| [ ] | Add MCP capability adapter | Reza | Ingest MCP server metadata/tool list names/descriptions into the shared service schema |
| [ ] | Add A2A capability adapter | Reza | Ingest A2A agent card capability names/descriptions into the shared service schema |
| [x] | Add local/demo agent adapter | Reza | `seed.ts` fallback tagged `source:"seed"`; card ingestion replaces seeded service on success |
| [ ] | Semantic grouping | Reza | Cluster/normalize capabilities into available service/tool categories |
| [x] | Expose tool catalog endpoint | Reza/Shruti | `GET /api/services` returns grouped services with agents |
| [ ] | Route by service/tool intent | Reza | `POST /api/route` accepts `service_id` or inferred intent, not only `register` |
| [x] | Include trust/payment metadata in catalog | Reza/Shayaun/Navid | `/api/services` options expose reputation, quote amount, asset, `pay_to`, `agent_id`, `registry_agent_id?` |
| [x] | Add discovery tests | Reza | `agents.test.ts`: clean cards, grouping, fallback, route-by-service, route-time quote drift |

Minimal demo routing metadata: `service_id`, `agent_id`, `quote_id`, amount, asset, `payTo`,
`observed_at`, `expires_at`. Discovery stores identity/service facts from `agent_uri`; active quotes
are router-local evidence used for validation. No signatures, dynamic pricing, multi-trust metadata, or
advanced policy fields are in demo scope.

## Target No-Custody x402 Flow

The target demo flow is discovery-proxy-first and payment-noncustodial: users call our proxy service
description, the router chooses the concrete agent, but the x402 payment still goes directly from
the client agent to the selected agent wallet.

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [ ] | Define proxy invocation shape | Reza/Navid | Client calls our service/tool endpoint; request carries `service_id` or task intent |
| [x] | Add quote policy layer | Reza/Navid | `refreshQuotes` stores quote-mode 402 snapshots in `ctx.quoteCache`; `/api/route` mints route-specific `ActiveQuote`s from fresh cache |
| [ ] | Select concrete agent by trust + price | Reza/Shayaun | Selection reads reputation, active quote, and availability |
| [ ] | Forward agent x402 challenge | Navid/Reza | Return agent `402 PaymentRequirements` with agent `payTo`; router does not settle or custody funds |
| [ ] | Preserve challenge correlation | Navid | Carry `route_id`, `agent_id`, active `quote_id`, x402 `nonce`, `resource`, amount, asset, network |
| [ ] | Record quote-vs-challenge mismatch | Navid/Reza | Compare active quote commitment to agent `402 PaymentRequirements`; do not block the happy-flow payment |
| [ ] | Decide post-payment invocation path | Reza/Navid | Either client calls agent directly, or client calls proxy with proof and proxy forwards the request |
| [ ] | Capture payment proof | Navid | Store txid/nonce/payer/agent/amount/asset after client payment settles |
| [ ] | Verify proof off-chain | Navid/Shayaun | Confirm txid paid selected agent wallet; reject replay or mismatched payer/agent |
| [ ] | Trigger automatic validation for quote drift | Shayaun/Reza | Quote drift, wrong `payTo`, invalid challenge, replay, or timeout creates validation evidence without user feedback |
| [ ] | Automatic validation updates reputation | Shayaun | `/api/validate` or successor writes validation result into in-memory reputation and validation/anchor evidence |
| [ ] | Feedback endpoint | Shayaun | `POST /api/feedback` or extended `/api/validate` accepts proof + satisfaction/verdict |
| [ ] | One feedback per proof | Shayaun/Navid | Dedupe by `paymentTxid` + `nonce` |
| [ ] | User-triggered reputation update | Shayaun | Update in-memory score and env-gated on-chain `giveFeedback` using payment proof + feedback |
| [ ] | Active validation / attestation path | Shayaun/Reza | Future validators can test an agent and award reputation through attestations, including optional ZK proofs |
| [ ] | UI shows direct-payment proof | Shruti | Catalog/route/pay flow shows selected agent wallet, txid, nonce, and feedback status |

Reputation has three input classes in the target flow: payment-backed user feedback, automatic
validations for objectively captured quote drift, and future active validations/attestations. Quote
drift means the x402 challenge violates an active quote commitment; it is validation evidence, not
`giveFeedback`. The TestNet happy flow lets the payment settle, then validates the mismatch using the
proof.

## Contracts And Registry Surface

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Identity registry contract | Reza | `contracts/identity_registry/*` |
| [x] | Reputation registry contract | Shayaun | `contracts/reputation_registry/*` |
| [x] | Validation registry contract | Shayaun | `contracts/validation_registry/*` |
| [x] | Generated clients/artifacts | Reza/Shayaun | `contracts/artifacts/*` |
| [x] | LocalNet deploy path | Navid | `npm run build && npm run deploy:localnet` |
| [x] | Env-gated on-chain reputation write | Shayaun | `apps/router/src/onchain.ts::maybeWriteReputation` |
| [x] | Split validation from user feedback chain writes | Shayaun/Reza | Quote-drift verdicts use validation/anchor evidence; `giveFeedback` is for user satisfaction |
| [x] | Add x402 `paymentTxid` + `nonce` to `giveFeedback` | Shayaun | Contract + generated client landed; router feedback lane remains separate |
| [x] | Confirm public TestNet registry app ids for pitch | Shayaun/Navid | Deployed + cross-linked on TestNet — Identity 764031067, Reputation 764031363, Validation 764031094 (`docs/status/DEPLOYED.md`, `apps/web/deployed.testnet.json`) |

## Frontend And Narrative

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Trust Router page consumes live API | Shruti | `POST /api/route`, `/pay`, `/validate`; ledger/reputation reads |
| [x] | Mock fallback remains available | Shruti | Per-endpoint fallback in `apps/web/router.js` |
| [x] | Marketplace/Studio/Contracts/Admin pages exist | Shruti | `apps/web/*.html`, `registry.js`, `arc8004.js` |
| [x] | Pitch script, deck outline, storyboard | Shruti | `docs/pitch/` |
| [ ] | Keep non-router console pages mock-first unless backend endpoints are added | Shruti | No raw registry backend endpoints yet |
| [ ] | Update docs/pitch/storyboard for target no-custody flow | Shruti/Navid | Current pitch artifacts describe the router-settled demo payer path |

## Cleanup / Consistency

| Status | Task | Owner | Evidence |
|---|---|---|---|
| [x] | Reduce markdown surface | Reza | Active docs listed in `README.md` |
| [x] | Remove stale H0 planning/spec docs | Reza | Deleted pre-build specs and logistics docs |
| [x] | Make `Agent` identity-only | Reza | `Agent = { id, name, agent_uri, agent_wallet }`; quote/service state is separate |
| [ ] | Decide whether `apps/router/src/ranking.ts` is wired or deleted | Reza/Navid | Active ranking is `agents.ts::discoveryOptions` |
| [ ] | Keep `INTEGRATION_HANDOFF.md` current as code changes land | Everyone | Endpoint signatures, shared Maps, and blockers only |

## Verification Checklist

Run before calling the current build demo-ready:

- [x] `npm test`
- [ ] `npm run test:contracts`
- [x] `npm run check-types`
- [ ] `npm start`
- [ ] Honest agent: `settled_amount == quoted_amount`
- [ ] Cheat agent: `settled_amount > quoted_amount`
- [ ] `/api/validate` lowers the cheat agent reputation
- [ ] Re-running `/api/route` avoids the caught agent
- [ ] `/api/ledger` contains hash-only anchors with explorer-ready txids
- [x] Discovery catalog groups at least one service with multiple agents
- [x] Route request can target a service/tool rather than a register lane
- [ ] Target flow forwards agent x402 challenge with agent wallet as `payTo`
- [x] Quote policy pins a fresh listing into an active quote commitment
- [ ] Target flow records quote-vs-challenge drift without blocking payment
- [ ] Automatic validation can lower reputation without user feedback
- [ ] Future active validation/attestation path is represented in docs or code
- [ ] Target flow accepts feedback only with valid `paymentTxid` + `nonce`

## Guardrails

- Read `INTEGRATION_HANDOFF.md` before writing code.
- Do not restore deleted legacy router or x402 files.
- Treat `apps/router/src/contract.ts` as shared API; coordinate before changing its wire shapes.
- Keep route handlers in route factories; `router-server.ts` composes them.
