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
| [x] | Define proxy invocation shape | Reza/Navid | `POST /mcp` exposes Claude Code tools: list services, route task, request payment, record proof, invoke paid service |
| [x] | Add quote policy layer | Reza/Navid | `refreshQuotes` stores quote-mode 402 snapshots in `ctx.quoteCache`; `/api/route` mints route-specific `ActiveQuote`s from fresh cache |
| [ ] | Select concrete agent by trust + price | Reza/Shayaun | Selection reads reputation, active quote, and availability |
| [x] | Forward agent x402 challenge | Navid/Reza | `POST /api/challenge`; returns execution 402 requirement with agent `pay_to`, nonce, resource, amount, asset, network, and `payment_note` |
| [x] | Preserve challenge correlation | Navid | `ctx.challengeStore`; carries `route_id`, `option_id`, `agent_id`, active `quote_id`, x402 `nonce`, `resource`, amount, asset, network |
| [x] | Record quote-vs-challenge mismatch | Navid/Reza | `/api/challenge` sets `quote_drift`; `/api/payment-proof` records ValidationRegistry/hash-anchor evidence without blocking payment |
| [x] | Decide post-payment invocation path | Reza/Navid | `liminal_invoke_paid_service` requires accepted proof, then proxy-forwards to provider MCP endpoint with `X-PAYMENT` |
| [x] | Capture payment proof | Navid | `POST /api/payment-proof {challenge_id, txid, payer}` stores accepted proof on the challenge |
| [x] | Verify proof off-chain | Navid/Shayaun | `ctx.deps.lookupPayment`; confirms sender/receiver/amount/asset/network/note, rejects replay/mismatch/stale challenge |
| [x] | Trigger automatic validation for quote drift | Shayaun/Reza | Quote drift only creates validation evidence; other failures reject proof/auth without reputation penalty |
| [x] | Automatic validation updates reputation | Shayaun | `/api/payment-proof` lowers `ctx.repState` for `quote_drift` and writes ValidationRegistry/hash-anchor evidence |
| [x] | Feedback endpoint | Shayaun | `POST /api/feedback/intent` + `POST /api/feedback`; requires payer self-auth tx |
| [x] | One feedback per proof | Shayaun/Navid | `ctx.usedFeedbackPaymentTxids` app pre-check plus ReputationRegistry `usedPayment(paymentTxid)` final guard |
| [x] | User-triggered reputation update | Shayaun | Payer-authorized feedback updates `ctx.repState`; ReputationRegistry write is env-gated/payer-signer-only with hash-anchor fallback |
| [x] | Third-party validator path out of scope | Shayaun/Reza | Active trust mechanisms are payer-authorized feedback and router policy validation for quote drift only |
| [x] | UI shows direct-payment proof | Shruti | `router.js` proof path consumes `/api/challenge`+`/api/payment-proof`(+feedback); shows agent wallet, nonce, note-bind, payment+validation txids, reputation; demo-settle default with legacy+mock fallback |

Reputation has two input classes in the target flow: payment-backed user feedback and automatic
validation for objectively captured quote drift. Quote drift means the x402 challenge violates an
active quote commitment; it is validation evidence, not `giveFeedback`. Wrong payer/receiver/amount,
stale challenge, bad nonce, and replay are proof/auth failures, not reputation penalties.

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

**Live x402 end-to-end demo PASSED on TestNet 2026-06-07** (driver `_mcp_drive.mjs` over `router-mcp-server.ts`, `LOW_SPEND_SMOKE=true npm start`). Payer `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI`. Real settles confirmed on-chain (indexer-verified): Cheat `AHVU2VCAIF26ZNJX6YQT5WIF2CPJPBR2MJMA5BJZIWYDMUMPL4UQ` (round 64130884, 0.06 > 0.04 quote, drift), Honest `UV6CKKDHRWMRIUXDZEFERQPK53SQODH5BOC2QYPDKNH5VJSRWZ7Q` (round 64130888, 0.1 = 0.1 quote), feedback auth `CZWARXMSD6SRCBWALYZHI3FQGZORM5WRMIVN6WKB2TQAPFYWHOIA` (round 64130892). Reputation: Cheat 60→45, Honest 60→70; re-route picked Honest after the drop. Explorer: `https://lora.algokit.io/testnet/transaction/<txid>`. (Payer left at 0.0055 ALGO available — re-fund before next run.)

- [x] `npm test`
- [ ] `npm run test:contracts`
- [x] `npm run check-types`
- [x] `npm start` — booted on `:3001`, TestNet, agents discovered (`LOW_SPEND_SMOKE=true`)
- [x] Honest agent: `settled_amount == quoted_amount` — 0.1 = 0.1 (`UV6CK…WZ7Q`)
- [x] Cheat agent: `settled_amount > quoted_amount` — 0.06 > 0.04 (`AHVU2…L4UQ`)
- [x] `/api/validate` lowers the cheat agent reputation — proof-path quote-drift auto-validation dropped Cheat 60→45 (`policy_result: quote_drift`)
- [x] Re-running `/api/route` reflects the caught agent's trust penalty — Honest became `options[0]` (trust 54 vs Cheat 51)
- [x] `/api/ledger` contains hash-only anchors with explorer-ready txids — ledger anchors `2VTO7EXL…`, `U2OSQG7B…`, `SO5HXCQO…`
- [x] Discovery catalog groups at least one service with multiple agents
- [x] Route request can target a service/tool rather than a register lane
- [x] Target flow forwards agent x402 challenge with agent wallet as `payTo`
- [x] Quote policy pins a fresh listing into an active quote commitment
- [x] Target flow records quote-vs-challenge drift without blocking payment
- [x] Automatic validation can lower reputation without user feedback
- [x] Third-party validator/attestation path is explicitly out of scope for this slice
- [x] Target flow accepts feedback only with valid `paymentTxid` + payer self-auth note nonce

## Guardrails

- Read `INTEGRATION_HANDOFF.md` before writing code.
- Do not restore deleted legacy router or x402 files.
- Treat `apps/router/src/contract.ts` as shared API; coordinate before changing its wire shapes.
- Keep route handlers in route factories; `router-server.ts` composes them.
