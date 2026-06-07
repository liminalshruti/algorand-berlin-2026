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
  -> registered by us in the TestNet IdentityRegistry when env/funds allow
  -> x402 readiness is explicit in cards and route-time requirements
  -> current /api/pay remains the router-settled demo shim
  -> future direct-payment proof path is planned but not live yet
```

The key product stance: discovery is curated/static for this hack demo. We know the agents already.
We do not crawl the chain, wait for providers to self-register, or depend on full MCP/A2A discovery
for this slice.

## Current State

- Live endpoints: `GET /api/agents`, `GET /api/services`, `POST /api/route`, `POST /api/pay`,
  `POST /api/validate`, `GET /api/reputation`, `GET /api/ledger`.
- Honest/Cheat cards live in `docs/agents/testnet/` and expose clean ARC-8004 identity/service facts.
- Router boot ingests the committed manifest or direct raw card URLs; fetch failure keeps seeded
  fallback agents alive.
- `GET /api/services` exposes one grouped `diligence.report` proxy catalog.
- `/api/route` creates active route-time quotes and payment requirements.
- `/api/pay` settles through the shared router demo payer, writes `ctx.paymentStore`, and anchors a
  hash-only ledger entry.
- `/api/validate` compares `PaymentResult.settled <= PaymentResult.quoted` and updates in-memory
  reputation through validation evidence, not user feedback.
- Payment state is currently in-memory Maps plus ledger anchors. There is no production DB in this
  slice.
- There is no `GET /api/tools`, no `/api/challenge`, no `/api/payment-proof`, and no `POST /api/feedback`
  yet.

## App IDs And Known Agents

Use the existing TestNet registries. Do not redeploy contracts for this slice.

| Registry | App ID |
|---|---:|
| IdentityRegistry | `764031067` |
| ReputationRegistry | `764031363` |
| ValidationRegistry | `764031094` |

Canonical cards:

| Agent | Card | Wallet |
|---|---|---|
| Honest Agent | `docs/agents/testnet/honest-agent.json` | `J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY` |
| Cheat Agent | `docs/agents/testnet/cheat-agent.json` | `3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ` |

Raw card URLs:

- Manifest: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/manifest.json`
- Honest: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/honest-agent.json`
- Cheat: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/cheat-agent.json`

Protocol references:

- Coinbase CDP x402 MCP server guide:
  `https://docs.cdp.coinbase.com/x402/mcp-server` — reference pattern for an MCP tool bridge that
  receives HTTP 402 payment requirements, signs payment, retries the paid request, and returns tool
  output. Use for Level 3 direct-payment design, not as current shim behavior.

Identity registration is env-gated:

- `IDENTITY_APP_ID=764031067`
- `IDENTITY_SUBMITTER_MNEMONIC=<funded private TestNet mnemonic>`

The backend registration helper signs with `IDENTITY_SUBMITTER_MNEMONIC`, so the submitter is the
initial registry owner. The helper should call `setAgentWallet(registry_agent_id, cardWallet)` so
`getAgentWallet` matches the card wallet when registration succeeds. If the submitter is missing or
unfunded, document the blocker and keep local/card ingestion working.

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

This is live now through router-owned logic.

- Cards declare x402 support but do not serve real x402 challenges.
- The router derives route-time quote snapshots and active payment requirements.
- Honest Agent: `0.1 ALGO` quoted and `0.1 ALGO` requested.
- Cheat Agent: `0.04 ALGO` quoted and `0.06 ALGO` requested.
- `/api/pay` acts as the demo facilitator shim and settles from the router payer to the selected
  agent wallet.
- `/api/validate` catches quote drift after payment by comparing settled amount to active quote.

### Level 3 - Future Real x402

This is planned, not live.

- Selected agent or provider returns real `402 PaymentRequirements`.
- Payment requirements use selected agent wallet as `payTo`.
- Client pays the selected agent wallet directly; the router does not custody funds.
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
POST /api/pay       { route_id, option_id }
POST /api/validate  { payment_id }
```

Future direct-payment interfaces to design in this plan before implementation:

```txt
POST /api/challenge      { route_id, option_id }
POST /api/payment-proof  { challenge_id, txid, payer }
POST /api/feedback       { proof_id, response }
```

Keep `/api/pay` documented as the current router-settled demo shim until the no-custody flow lands.

## Guardrails

- Do not read or use anything under `ref/archive/` or any path containing `/archive/`.
- Do not restore deleted legacy router or x402 files.
- Treat `apps/router/src/contract.ts` as shared API; make additive shape changes only when needed.
- Keep route handlers inside route factories, especially `apps/router/src/routes.agents.ts`.
- Do not run `npm start` casually on TestNet; it can spend TestNet funds by funding/registering agents.
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

Purpose: register Honest/Cheat cards in the deployed TestNet IdentityRegistry when env/funds allow.

- Use IdentityRegistry app id `764031067`.
- Register only Honest Agent and Cheat Agent for this slice.
- Use the canonical raw card URLs as `agent_uri`.
- After `register(...)`, call `setAgentWallet(registry_agent_id, cardWallet)` when supported by the
  current helper.
- Record `registry_agent_id`, owner, txid, wallet txid, explorer link, and any blocker.
- If `IDENTITY_SUBMITTER_MNEMONIC` is missing or unfunded, mark this phase `BLOCKED` and keep local
  ingestion working.

Gate:

- Both agents have on-chain `registry_agent_id` values recorded, or the exact funding/env blocker is
  recorded.
- Card-backed `/api/agents` and `/api/services` still work without on-chain registration.

### Phase 2 - x402 Readiness Checklist

Purpose: make x402 readiness explicit before building direct payment.

- Keep parser requirements for `x402Support: true`, `active: true`, valid MCP endpoint, and valid
  Algorand wallet.
- Add or document a checklist that distinguishes card declaration from real x402 challenge support.
- Confirm public catalog does not expose hidden Cheat behavior.
- Confirm `/api/services` quote snapshots remain router-derived, not card-authored.
- Confirm `/api/route` creates active quotes and payment requirements at route time.

Gate:

- Tests still reject missing x402 declaration, inactive cards, invalid wallets, and invalid MCP
  endpoints.
- `GET /api/services` shows agent wallet as `pay_to` without hidden cheat fields.

### Phase 3 - Direct-Payment Proof Path Design

Purpose: define the future no-custody flow without breaking the current demo shim.

- Specify `POST /api/challenge { route_id, option_id }` response shape for x402-style payment
  requirements.
- Specify `POST /api/payment-proof { challenge_id, txid, payer }` input and stored proof shape.
- Preserve challenge correlation: `route_id`, `option_id`, `agent_id`, `quote_id`, nonce, resource,
  amount, asset, payTo, network, observed/expires timestamps.
- Decide whether post-payment invocation is client-to-agent direct or proxy-with-proof; record the
  decision here before implementation.
- Keep `/api/pay` available as the demo shim until the direct-payment path is proven.

Gate:

- New wire shapes are documented before code changes.
- Replay, wrong wallet, wrong amount, mismatched route/agent/quote, and stale challenge behavior are
  specified.

### Phase 4 - Validation And Reputation From Proof

Purpose: validate objectively captured quote/challenge/proof evidence without modeling it as user
feedback.

- Compare active quote to x402 challenge amount and `payTo`.
- Compare verified proof to selected agent, expected wallet, amount, asset, network, and payer.
- Record quote drift, wrong `payTo`, invalid proof, replay, and timeout as validation evidence.
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
- Verify `/api/validate` lowers Cheat reputation and reroute avoids the caught agent.
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
| Phase 1 - Known-Agent Identity Registration | BLOCKED | Code path landed; `npm test` PASS; `npm run check-types` PASS; `npm run setup:testnet-identity -- --check` found `IDENTITY_SUBMITTER_ADDRESS=ABAS5P7RW6JSZKFACWWKGNOIR5HCA2WXBTANZU4GIU7JBWOGRW6TSVLBKU` with `0` ALGO; `npm run register:testnet-agents -- --check` stopped before tx with the same blocker. | Fund with `algokit dispenser fund --receiver ABAS5P7RW6JSZKFACWWKGNOIR5HCA2WXBTANZU4GIU7JBWOGRW6TSVLBKU --amount 2 --whole-units`, then rerun checks and `npm run register:testnet-agents`. No TestNet registration tx sent. |
| Phase 2 - x402 Readiness Checklist | TODO | Pending. | Current cards already declare `x402Support: true`; confirm parser/tests remain aligned. |
| Phase 3 - Direct-Payment Proof Path Design | TODO | Pending. | Future interfaces are planned, not live. |
| Phase 4 - Validation And Reputation From Proof | TODO | Pending. | Automatic validation must stay separate from user feedback. |
| Phase 5 - Live Smoke And Handoff | TODO | Pending. | Run non-spending checks before any TestNet smoke. |

## Test Plan

Non-spending checks:

- `npm test`
- `npm run check-types`
- `npm run setup:testnet-identity -- --check`
- `npm run register:testnet-agents -- --check`

Registration checks:

- If `IDENTITY_SUBMITTER_MNEMONIC` is funded, register Honest/Cheat and record `registry_agent_id`,
  txid, owner, wallet, and explorer link.
- If not funded, record blocker and keep local/card ingestion working.

Demo checks:

- `GET /api/services` returns one `diligence.report` group with Honest/Cheat.
- `POST /api/route` creates active quotes.
- Honest settles at quote through current shim.
- Cheat settles above quote through current shim.
- `/api/validate` lowers Cheat reputation.

Future x402 checks:

- Payment requirements include selected agent wallet as `payTo`.
- Proof verification rejects wrong wallet, wrong amount, replay, stale challenge, and mismatched
  route/agent/quote.
- Quote drift can update validation/reputation without user feedback.

## Assumptions

- Honest/Cheat are the only known-agent rollout targets for now.
- Curated discovery is acceptable for the demo; full chain scan and provider self-registration are
  not required.
- Real provider-hosted x402 challenge endpoints are not required yet.
- `/api/pay` remains the current router-settled demo shim until direct payment is implemented.
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
