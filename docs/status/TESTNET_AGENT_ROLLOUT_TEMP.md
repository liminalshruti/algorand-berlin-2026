# Known-Agent x402 Rollout Handoff

Temporary execution handoff for the next implementation slice.

This file replaces the completed `TestNet Agent Rollout Handoff`. That previous plan finished all
phases for Honest/Cheat card ingestion, `/api/services`, and route-time demo quotes. Keep this path
stable because `INTEGRATION_HANDOFF.md` points here; use git history if the completed card-catalog
plan is needed again.

## Objective

Move the demo from "card-backed catalog + router-settled payment shim" toward known-agent x402:

```txt
Known Honest/Cheat agents
  -> curated ARC-8004 cards
  -> registered by us in the TestNet IdentityRegistry when submitter env is ready
  -> x402 readiness is explicit in cards and cached 402 quote probes
  -> current /api/pay remains the router-settled demo shim
  -> direct-payment proof endpoints are live in the router
  -> no-custody UI/client invocation remains the next slice
```

The key product stance: discovery is curated/static for this hack demo. We know the agents already.
We do not crawl the chain, wait for providers to self-register, or depend on full MCP/A2A discovery
for this slice.

## Current State

- Live endpoints: `GET /api/agents`, `GET /api/services`, `POST /api/route`, `POST /api/challenge`,
  `GET /api/challenge/:challenge_id`, `POST /api/payment-proof`, `POST /api/feedback/intent`,
  `POST /api/feedback`, `POST /api/pay`, `POST /api/validate`, `GET /api/reputation`,
  `GET /api/ledger`, `POST /mcp`.
- Honest/Cheat cards live in `docs/agents/testnet/` and expose clean ARC-8004 identity/service facts.
- Router boot ingests the committed manifest or direct raw card URLs; fetch failure keeps seeded
  fallback agents alive.
- `GET /api/services` exposes one grouped `diligence.report` proxy catalog with cached 402 quote snapshots.
- `npm run agents:local` serves local Honest/Cheat MCP/x402 providers on `:4021`.
- Router warmup and lazy refresh probe card-backed `AgentService.endpoint`s in quote mode and cache
  402 responses in `ctx.quoteCache`; `/api/route` mints route-specific active quotes from fresh cache.
- `/api/pay` remains the legacy router-settled demo shim, but now asks the selected agent endpoint for
  an execution 402 before settling; the router no longer authors Honest/Cheat drift.
- `/api/validate` compares `PaymentResult.settled <= PaymentResult.quoted` and updates in-memory
  reputation through validation evidence, not user feedback.
- `/api/challenge` asks the selected agent for execution 402, stores a short-lived challenge, and
  marks quote drift only when execution amount differs from the fresh active quote.
- `/api/payment-proof` verifies confirmed Algorand payment sender/receiver/amount/asset/network and
  challenge-bound note; quote drift lowers in-memory reputation and writes ValidationRegistry evidence
  when configured, otherwise hash-anchor fallback.
- `/api/feedback/intent` + `/api/feedback` require payer authorization through a 0-ALGO self-payment
  auth tx; feedback txid replay is pre-checked in app and guarded by ReputationRegistry `usedPayment`
  when on-chain feedback is available.
- Low-spend proof smoke mode is wired: `LOW_SPEND_SMOKE=true npm start` skips already-funded agent
  wallets and aborts before any top-up if a required wallet is underfunded.
- Spending runner is explicit: `npm run smoke:testnet:proof` runs the Cheat-only direct settlement
  + 0-ALGO auth feedback path and rejects duplicate feedback.
- Proof APIs accept `user_id` (= payer Algorand address) and `settlement_txid` aliases while preserving
  the older `payer`, `txid`, and `payment_txid` names.
- Honest/Cheat are registered in the TestNet IdentityRegistry and recorded in
  `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json`; router boot consumes this evidence and does
  not mint records.
- Payment state is currently in-memory Maps plus ledger anchors. There is no production DB in this
  slice.
- There is no `GET /api/tools` yet; MCP tool-list parsing and A2A discovery remain deferred.

## App IDs And Known Agents

Use the existing TestNet registries. Do not redeploy contracts for this slice.

| Registry | App ID |
|---|---:|
| IdentityRegistry | `764031067` |
| ReputationRegistry | `764031363` |
| ValidationRegistry | `764031094` |

Canonical cards:

| Agent | Card | MCP endpoint | Wallet |
|---|---|---|---|
| Honest Agent | `docs/agents/testnet/honest-agent.json` | `http://localhost:4021/honest/mcp` | `J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY` |
| Cheat Agent | `docs/agents/testnet/cheat-agent.json` | `http://localhost:4021/cheat/mcp` | `3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ` |

Local x402 provider behavior (`npm run agents:local`):

| Agent | Quote probe 402 | Execution 402 |
|---|---:|---:|
| Honest Agent | `0.10 ALGO` | `0.10 ALGO` |
| Cheat Agent | `0.04 ALGO` | `0.06 ALGO` |

Both local providers expose the same paid tool:

```txt
answer_obvious_claim - Return whether the claim "2 + 2 = 4" is true.
```

Paid Honest invocation returns `true`; paid Cheat invocation returns `false`.

Raw card URLs:

- Manifest: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/manifest.json`
- Honest: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/honest-agent.json`
- Cheat: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/cheat-agent.json`

Protocol references:

- Algorand x402 MCP server guide:
  `https://github.com/algorandfoundation/x402-demo/tree/main/x402-examples/client/mcp` — reference pattern for an MCP tool bridge that
  receives HTTP 402 payment requirements, signs payment, retries the paid request, and returns tool
  output. Use for Level 3 direct-payment design, not as current shim behavior.

Identity registration is env-gated:

- `IDENTITY_APP_ID=764031067`
- `IDENTITY_SUBMITTER_MNEMONIC=<funded private TestNet mnemonic>`

The backend registration helper signs with `IDENTITY_SUBMITTER_MNEMONIC`, so the submitter is the
initial registry owner. The helper should call `setAgentWallet(registry_agent_id, cardWallet)` so
`getAgentWallet` matches the card wallet when registration succeeds. If the submitter is missing or
does not resolve to the pre-funded key, document the blocker and keep local/card ingestion working.

## x402 Compliance Levels

Use these levels consistently in code, docs, and pitch language.

### Level 1 - Current Required Card Declaration

This is live now and required for catalog ingestion.

- Card has `type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`.
- Card has `active: true`.
- Card has `x402Support: true`.
- Card has an `MCP` service with an HTTP endpoint.
- Card has an `algorand-wallet` service with a valid Algorand address.
- Card does not include router-owned service ids, quote fields, hidden cheat behavior, or proof fields.

### Level 2 - Current Demo x402 Shim

This is live now through local agent-hosted 402 behavior plus the router-settled shim.

- Cards declare x402 support and point at local MCP/x402 endpoints for the demo.
- The router probes selected service endpoints ahead of routing and stores quote-mode 402s in `ctx.quoteCache`.
- Honest Agent: quote probe `0.10 ALGO`, execution challenge `0.10 ALGO`.
- Cheat Agent: quote probe `0.04 ALGO`, execution challenge `0.06 ALGO`.
- `/api/pay` acts as the demo facilitator shim and settles from the router payer to the selected
  agent wallet after asking the selected local agent for its execution 402.
- `/api/validate` catches quote drift after payment by comparing settled amount to active quote.

### Level 3 - Direct-Payment Proof Path

The router proof endpoints are live now. Claude Code can use the no-custody path through the
router-hosted MCP facade and `apps/web/mcp-sign.html`; the main Trust Router UI still uses `/api/pay`.

- Selected local agent endpoint returns execution `402 PaymentRequirements` through `/api/challenge`.
- Payment requirements use selected agent wallet as `payTo`.
- Client/direct payer settlement to the selected agent wallet is the target no-custody path; the
  current `/api/pay` shim still exists separately for the legacy demo.
- Router records `route_id`, `agent_id`, `quote_id`, challenge nonce, resource, amount, asset,
  network, payer, and settlement txid.
- Router verifies proof off-chain and rejects wrong wallet, wrong amount, replay, mismatched payer,
  mismatched quote/challenge, and stale challenges.
- Quote-vs-challenge drift becomes automatic validation evidence. It is not user feedback.

## Interfaces To Track

Current live interfaces:

```txt
GET  /api/agents
GET  /api/services
POST /api/route     { task, service_id? }
POST /api/challenge { route_id, option_id }
GET  /api/challenge/:challenge_id
POST /api/payment-proof { challenge_id, settlement_txid|txid, user_id|payer }
POST /api/feedback/intent { challenge_id, settlement_txid|payment_txid, user_id|payer, response }
POST /api/feedback { feedback_intent_id, auth_txid }
POST /api/pay       { route_id, option_id }
POST /api/validate  { payment_id }
POST /mcp           Claude Code MCP Streamable HTTP
```

Local demo provider:

```txt
npm run agents:local
POST http://localhost:4021/honest/mcp { mode:"quote"|"execute" } -> 402 PaymentRequirements
POST http://localhost:4021/cheat/mcp  { mode:"quote"|"execute" } -> 402 PaymentRequirements
POST http://localhost:4021/honest/mcp + X-PAYMENT -> tool_result.answer=true
POST http://localhost:4021/cheat/mcp  + X-PAYMENT -> tool_result.answer=false
```

Current router-internal x402 helpers:

```txt
fetchPaymentRequirementFromService(service, request)
refreshQuotes(ctx, service_id?) -> ctx.quoteCache
paymentRequirementForExecution(ctx, option)
createPaymentChallenge(ctx, route_id, option_id)
acceptPaymentProofForChallenge(ctx, challenge_id, txid, payer)
invokePaidService(ctx, challenge_id, payload?)
PaymentChallenge { challenge_id, route_id, option_id, agent_id, service_id, quote_id, nonce, resource, amount, asset, pay_to, network, observed_at, expires_at }
```

Direct-payment proof interfaces now live:

```txt
POST /api/challenge         { route_id, option_id }
GET  /api/challenge/:challenge_id
POST /api/payment-proof     { challenge_id, settlement_txid|txid, user_id|payer }
POST /api/feedback/intent   { challenge_id, settlement_txid|payment_txid, user_id|payer, response }
POST /api/feedback          { feedback_intent_id, auth_txid }
POST /mcp                  tools: liminal_list_services, liminal_route_task, liminal_request_payment, liminal_record_payment_proof, liminal_invoke_paid_service
```

Keep `/api/pay` documented as the current router-settled demo shim until the no-custody flow lands.

## Guardrails

- Do not read or use anything under `ref/archive/` or any path containing `/archive/`.
- Do not restore deleted legacy router or x402 files.
- Treat `apps/router/src/contract.ts` as shared API; make additive shape changes only when needed.
- Keep route handlers inside route factories, especially `apps/router/src/routes.agents.ts`.
- Do not run `npm start` casually on TestNet; it can spend TestNet funds by funding demo agents.
  It consumes known-agent registration evidence but does not register agents.
- Use `LOW_SPEND_SMOKE=true npm start` for sub-0.1 ALGO proof smoke prep; this mode aborts instead
  of topping up an underfunded agent wallet.
- Do not redeploy registry contracts for this slice.
- Do not add a persistent production DB in this slice unless this file is updated first.
- Keep `INTEGRATION_HANDOFF.md` current when endpoint signatures, env requirements, app ids, or
  teammate-visible blockers change.

## Phased Execution And Gates

Use these phases in order. At the end of each phase, update the Phase Validation Log below before
advancing.

### Phase 0 - Retire Old Plan And Record Baseline

Purpose: make this file the active temp tracker for known-agent x402.

- Replace the completed card-catalog rollout plan in this file.
- Confirm TestNet app ids from `docs/status/DEPLOYED.md`.
- Record that discovery is curated/static, not crawled.
- Record that payment state is in-memory Maps plus ledger anchors, not a DB.
- Update `INTEGRATION_HANDOFF.md` so this temp handoff points at known-agent x402.

Gate:

- This file is replaced in place.
- `INTEGRATION_HANDOFF.md` points to this new purpose.
- No TestNet-spending command is run.

### Phase 1 - Known-Agent Identity Registration

Purpose: register Honest/Cheat cards in the deployed TestNet IdentityRegistry when submitter env is ready.

- Use IdentityRegistry app id `764031067`.
- Register only Honest Agent and Cheat Agent for this slice.
- Use the canonical raw card URLs as `agent_uri`.
- After `register(...)`, call `setAgentWallet(registry_agent_id, cardWallet)` when supported by the
  current helper.
- Record `registry_agent_id`, owner, txid, wallet txid, explorer link, and any blocker.
- If `IDENTITY_SUBMITTER_MNEMONIC` is missing or does not resolve to the funded submitter, mark this
  phase `BLOCKED` and keep local ingestion working.

Required command order:

```bash
npm run setup:testnet-identity          # or: npm run setup:testnet-known-agents
npm run setup:testnet-identity -- --check
npm run register:testnet-agents -- --check
npm run register:testnet-agents
npm start                              # consumes evidence only; never registers agents
```

Gate:

- Both agents have on-chain `registry_agent_id` values recorded, or the exact identity submitter/env blocker is
  recorded.
- Card-backed `/api/agents` and `/api/services` still work without on-chain registration.

### Phase 2 - x402 Readiness Checklist

Purpose: make x402 readiness explicit before building direct payment.

- Keep parser requirements for `x402Support: true`, `active: true`, valid MCP endpoint, and valid
  Algorand wallet.
- Add or document a checklist that distinguishes card declaration from real x402 challenge support.
- Confirm public catalog does not expose hidden Cheat behavior.
- Confirm `/api/services` quote snapshots remain runtime-observed, not card-authored.
- Confirm `/api/route` creates route-specific active quotes and payment requirements from cached quote snapshots.

Gate:

- Tests still reject missing x402 declaration, inactive cards, invalid wallets, and invalid MCP
  endpoints.
- `GET /api/services` shows agent wallet as `pay_to` without hidden cheat fields.

### Phase 3 - Agent-Hosted x402 Quote Ingestion

Purpose: move Honest/Cheat quote and drift behavior into local agent-hosted MCP/x402 endpoints without
breaking the current demo shim.

- Add local Honest/Cheat MCP/x402 endpoints on `:4021`.
- Probe each card-backed service endpoint in quote mode and store the returned 402 as `ActiveQuote`.
- Keep `AgentService` as endpoint metadata only; no quote, challenge, or hidden cheat fields.
- Add `PaymentChallenge` as a separate wire type.
- Make the legacy `/api/pay` shim ask the selected agent endpoint for execution 402 before settling.
- Keep `/api/pay` available as the demo shim until the direct-payment path is proven.

Gate:

- `npm run agents:local` serves Honest/Cheat local MCP/x402 endpoints.
- `/api/route` ranks from probed 402 quotes.
- Cheat quote probe is `0.04 ALGO`; Cheat execution challenge is `0.06 ALGO`.
- `AgentService` remains clean endpoint metadata.
- `npm test` and `npm run check-types` pass.

### Phase 4 - Validation And Reputation From Proof

Purpose: validate objectively captured quote/challenge/proof evidence without modeling it as user
feedback.

- Compare active quote to x402 challenge amount while the active quote is fresh.
- Compare verified proof to selected agent, expected wallet, amount, asset, network, payer, and
  challenge-bound note.
- Record quote drift as validation evidence. Treat wrong payer/receiver/amount/asset/network, stale
  challenge, bad nonce, and replay as proof/auth failures, not reputation penalties.
- Update in-memory reputation from automatic validation.
- Keep ReputationRegistry `giveFeedback(paymentTxid, nonce, ...)` reserved for explicit user feedback.

Gate:

- Automatic validation can lower reputation without calling user-feedback code.
- Feedback, when added, requires valid `paymentTxid` and nonce and dedupes proof use.

### Phase 5 - Live Smoke And Handoff

Purpose: prove the current demo remains intact and the next x402 path is ready to implement.

- Run non-spending checks first: `npm test` and `npm run check-types`.
- If TestNet funds are available and the team agrees, smoke:
  - `GET /api/services`;
  - `POST /api/route { "service_id": "diligence.report", "task": "..." }`;
  - current shim: `POST /api/pay { route_id, option_id }`;
  - `POST /api/validate { payment_id }`.
- Verify Honest settles at quote through the current shim.
- Verify Cheat settles above quote through the current shim.
- Verify `/api/validate` lowers Cheat effective reputation and subsequent routing reflects the trust penalty.
- Update `INTEGRATION_HANDOFF.md`, `BUILD_CHECKLIST_2026-06-06.md`, and pitch docs only when their
  visible facts change.

Gate:

- `npm test` passes.
- `npm run check-types` passes.
- Live smoke evidence is recorded, or skipped with the exact reason.
- Current `/api/pay` and `/api/validate` behavior remains intact.

## Phase Validation Log

| Phase | Status | Validation evidence | Notes |
|---|---|---|---|
| Phase 0 - Retire Old Plan And Record Baseline | PASS | This file replaced the completed card-catalog rollout plan; app ids confirmed from `docs/status/DEPLOYED.md`; `INTEGRATION_HANDOFF.md` pointer updated. | No TestNet-spending command run. |
| Phase 1 - Known-Agent Identity Registration | PASS | `npm run register:testnet-agents -- --check` PASS; `npm run register:testnet-agents` registered Honest `registry_agent_id=1` and Cheat `registry_agent_id=2`; evidence recorded in `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json`. | Owner `ABAS5P7RW6JSZKFACWWKGNOIR5HCA2WXBTANZU4GIU7JBWOGRW6TSVLBKU`; Honest txs `ZQ4VZVKAHKPTA7GZSGRFZ7CF3EPXSF3G4IBG5UWPWTPLOTF2WVAQ` / `G6M6XS6NK2Y3K4DI66KDPD64PZCWYPYCOOM7OKJ73HM6TXSYFQWQ`; Cheat txs `IO4QNVCWR6MRWCUJDLNDWUA2ZIJ35OXQLK4ITX76EPLTGSETQSYQ` / `MWI56EUVNEUJWNXOJGT2KPLYYMKO7QS6LZHDSPWR3OQB5MKQEZUA`. |
| Phase 2 - x402 Readiness Checklist | PASS | `npm test` PASS; in-process `GET /api/services` shows Honest/Cheat `registry_agent_id` values with `quote.pay_to` equal to agent wallets and no hidden challenge field; in-process `POST /api/route` created 2 active quotes and 2 payment requirements. | Cards remain declaration-only x402; Phase 3 supersedes router-derived quote fixtures with 402 probes. |
| Phase 3 - Agent-Hosted x402 Quote Ingestion | PASS | `npm test` PASS; `npm run check-types` PASS; tests mock Honest/Cheat 402 quote probes, quote-cache refresh, stale refresh, unreachable-agent skip, and execution challenges. | `npm run agents:local` serves `:4021`; quote-mode 402s warm/lazy-refresh into `ctx.quoteCache`; `/api/route` mints route-specific `ActiveQuote`s from fresh cached quotes; legacy `/api/pay` asks execution 402 before settling. |
| Phase 4 - Validation And Reputation From Proof | PASS | `npm test` PASS; `npm run check-types` PASS; `routes.trust.test.ts` covers challenge creation, quote drift, fair proof, proof rejection, replay, quote-drift reputation/reroute, payer self-auth feedback, duplicate feedback rejection, and rebate. | Quote drift is the only automatic reputation policy; wrong payer/receiver/amount/nonce/stale/replay are proof/auth failures, not reputation penalties. |
| Phase 5 - Live Smoke And Handoff | PENDING SPENDING SMOKE | 2026-06-07 non-spending checks: `npm test` PASS (62 tests); `npm run check-types` PASS; `npm run register:testnet-agents -- --check` PASS with 2 canonical Honest/Cheat cards validated and no registration txs sent; `npx tsx scripts/low-spend-proof-smoke.ts` refused to spend without `--spend`. Low-spend proof smoke code is wired: idempotent funding skips funded wallets, strict mode aborts before funding, `user_id`/`settlement_txid` aliases are tested, and `npm run smoke:testnet:proof` runs the Cheat-only proof path. Direct TestNet algod query from prior preflight: shared demo payer `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI` has `2.657 ALGO` total / `2.0145 ALGO` available; identity submitter `ABAS5P7RW6JSZKFACWWKGNOIR5HCA2WXBTANZU4GIU7JBWOGRW6TSVLBKU` has `13.996 ALGO` total / `13.896 ALGO` available; Honest wallet has `1.6 ALGO`; Cheat wallet has `1.5 ALGO`. | Spending smoke not run yet. Intended low-spend path: `LOW_SPEND_SMOKE=true npm start`, then `npm run smoke:testnet:proof` for one Cheat direct settlement `0.06 ALGO` with challenge note, one 0-ALGO self-payment auth, accepted feedback, and duplicate feedback rejection. Existing Honest/Cheat Identity registrations remain recorded and consumed from `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json`. |

## Test Plan

Non-spending checks:

- `npm test`
- `npm run check-types`
- `npm run setup:testnet-identity -- --check`
- `npm run setup:testnet-known-agents -- --check`
- `npm run register:testnet-agents -- --check`

Registration checks:

- If `IDENTITY_SUBMITTER_MNEMONIC` resolves to the pre-funded submitter, run `npm run register:testnet-agents -- --check`, then
  `npm run register:testnet-agents`, and record `registry_agent_id`, txid, owner, wallet txid, and
  explorer links.
- If it resolves to the wrong submitter or is below the script readiness threshold, record blocker and
  keep local/card ingestion working.

Demo checks:

- `npm run agents:local` serves `http://localhost:4021/honest/mcp` and
  `http://localhost:4021/cheat/mcp`.
- `GET /api/services` returns one `diligence.report` group with Honest/Cheat.
- `POST /api/route` creates active quotes from cached quote-mode 402 snapshots.
- Cheat quote probe is `0.04 ALGO`; Cheat execution 402 is `0.06 ALGO`.
- Honest settles at quote through current shim.
- Cheat settles above quote through current shim.
- `/api/validate` lowers Cheat reputation.
- `POST /mcp` lists five Liminal tools and routes `diligence.report` through Honest/Cheat.
- `liminal_request_payment` returns `sign_url` for `apps/web/mcp-sign.html`.
- `liminal_invoke_paid_service` rejects unpaid challenges and forwards accepted proof calls with
  `X-PAYMENT`.

Future x402 checks:

- Payment requirements include selected agent wallet as `payTo`.
- Proof verification rejects wrong wallet, wrong amount, replay, stale challenge, and mismatched
  route/agent/quote.
- Quote drift can update validation/reputation without user feedback.
- Feedback requires payer wallet control via 0-ALGO self-payment auth; txid possession alone is not enough.
- Low-spend proof smoke stays below `0.1 ALGO` only when boot funding is skipped; if strict mode
  reports `abort low-spend smoke`, top up the affected wallet or stop.

## Assumptions

- Honest/Cheat are the only known-agent rollout targets for now.
- Curated discovery is acceptable for the demo; full chain scan and provider self-registration are
  not required.
- Real external provider-hosted x402 challenge endpoints are not required yet; local demo providers
  run via `npm run agents:local`.
- `/api/pay` remains the current main-UI router-settled demo shim; MCP uses the direct payment proof
  path plus the Pera signing bridge.
- Current storage remains in-memory Maps plus hash-only ledger anchors.
- Registry contracts stay at the deployed TestNet app ids listed above.

## Deferred Later Slices

- Full ARC-8004 chain scan.
- MCP tool-list parsing.
- A2A agent-card adapter.
- Semantic service clustering.
- Production persistence and TTLs.
- Provider self-service registration UI.
- MainNet deployment policy.
