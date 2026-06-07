# Integration Handoff — x402 Trust Router

Live doc. Each engineer updates their section when they land code.
Everyone's Claude should read this before writing anything.

## x402 end-to-end live demo — ✅ DONE (verified on TestNet 2026-06-07)

Full spine ran live through the `mcp__x402-trust-router__*` tools (driver: `_mcp_drive.mjs` against `router-mcp-server.ts`) with `LOW_SPEND_SMOKE=true npm start`. All three settlements confirmed on-chain via indexer; reputation moved exactly as designed.

- Payer (paying agent wallet): `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI` · network `testnet`.
- **Cheat settle (quote drift):** quoted 0.04 → demanded 0.06, settled **0.06 ALGO**, `proof_status: confirmed`, `quote_drift: true`. txid `AHVU2VCAIF26ZNJX6YQT5WIF2CPJPBR2MJMA5BJZIWYDMUMPL4UQ` (round 64130884) — https://lora.algokit.io/testnet/transaction/AHVU2VCAIF26ZNJX6YQT5WIF2CPJPBR2MJMA5BJZIWYDMUMPL4UQ
- **Honest settle (on quote):** quoted 0.1, settled **0.1 ALGO**, `quote_drift: false`. txid `UV6CKKDHRWMRIUXDZEFERQPK53SQODH5BOC2QYPDKNH5VJSRWZ7Q` (round 64130888) — https://lora.algokit.io/testnet/transaction/UV6CKKDHRWMRIUXDZEFERQPK53SQODH5BOC2QYPDKNH5VJSRWZ7Q
- **Feedback auth (0-ALGO self-pay):** `accepted: true`. txid `CZWARXMSD6SRCBWALYZHI3FQGZORM5WRMIVN6WKB2TQAPFYWHOIA` (round 64130892) — https://lora.algokit.io/testnet/transaction/CZWARXMSD6SRCBWALYZHI3FQGZORM5WRMIVN6WKB2TQAPFYWHOIA
- **Reputation:** Cheat `60 → 45` (quote-drift penalty, auto-validation). Honest `60 → 70` (payment-backed feedback). Re-route after the drop made the Honest agent `options[0]` (trust 54 vs Cheat 51) with no human in the loop.
- Cheat deliverable was wrong (`answer: false` to "2+2=4"), Honest correct (`answer: true`) — both over real paid x402 (`http_status: 200`).
- ⚠️ **Payer nearly drained:** `24E3…` now reads `0.648 ALGO` total / `0.0055 ALGO` available. Re-fund via the dispenser before the next live run.

## Current state (origin/main) — core loop landed ✅

- **Endpoints live on `:3001`:** `POST /api/route`, `POST /api/challenge`, `GET /api/challenge/:challenge_id`, `POST /api/payment-proof`, `POST /api/feedback/intent`, `POST /api/feedback`, `POST /api/pay`, `POST /api/validate`, `GET /api/reputation`, `GET /api/ledger`, `GET /api/agents`, `GET /api/services`, `POST /mcp`.
- **On-chain:** ARC-8004 Identity + Reputation + Validation registries (Algorand TS) with deploy configs, unit specs, and `scripts/localnet-e2e.ts`.
- **✅ DEPLOYED ON TESTNET (wired):** Identity `764031067`, Reputation `764031363`, Validation `764031094` — both Reputation & Validation are `initialize()`'d so their global `idApp` = `764031067` (verified on-chain). Reputation `764031363` ships the x402 `giveFeedback` coupling (supersedes earlier `764031075`). Deployer/creator = shared payer `24E3…`. **See `docs/status/DEPLOYED.md`** for code hashes + creation txids; app ids also in `apps/web/deployed.testnet.json`; UI (`arc8004.js`) consumes them. Redeploy: `npm run deploy:testnet` (orchestrator: `scripts/deploy-testnet.ts`, idempotent via indexer).
- **Frontend:** 5 pages + a left sidebar (Trust Router · Marketplace · Agent Studio · Contracts · Admin) under `apps/web/`.
- **Open follow-ups:** Honest/Cheat ARC-8004 card catalog + local 402 quote ingestion are wired; proof-backed `/api/challenge` -> `/api/payment-proof` and payer-authorized `/api/feedback` are wired in the router; router-hosted MCP facade is wired for Claude Code; full chain scan/provider MCP tool-list/A2A discovery is not wired; `/api/pay` still exists as the router-settled demo shim; registry writes are env-gated with hash-anchor fallback; main Trust Router UI has not consumed the new proof endpoints yet; `apps/router/src/ranking.ts` is an unused stub (ranking lives in `agents.ts::discoveryOptions`). _(The TEMP `/api/route` stub was removed in d9c303c.)_

---

## Shared context

- Server runs on `:3001` — `npm start` from project root. **Defaults to TestNet** via committed `.env.demo` (shared throwaway payer + deployed app ids); local `.env` is optional for non-secret network/port overrides.
- Local demo x402 providers run on `:4021` — `npm run agents:local`; endpoints: `POST /honest/mcp`, `POST /cheat/mcp`.
- Claude Code MCP facade runs on the router: `POST http://localhost:3001/mcp`; add with `claude mcp add --transport http liminal http://localhost:3001/mcp`. Tools: `liminal_list_services`, `liminal_route_task`, `liminal_request_payment`, `liminal_record_payment_proof`, `liminal_invoke_paid_service`.
- MCP Pera handoff: serve `apps/web` on `:3000`; `WEB_BASE_URL=http://localhost:3000` makes `liminal_request_payment` return `/mcp-sign?challenge_id=...`; the page signs the TestNet payment and posts `/api/payment-proof`.
- Markdown source of truth: `README.md` (run/status), `BUILD_CHECKLIST_2026-06-06.md` (done/left tracker), `docs/reference/END_TO_END_HACK_SCOPE_2026-06-06.md` (demo scope), `apps/web/README.md` (frontend), `docs/pitch/*` (submission), `docs/reference/ERC8004_AVM_MAPPING.md` + `docs/reference/ARC-8004.md` (standards).
- Temporary execution handoff: `docs/status/TESTNET_AGENT_ROLLOUT_TEMP.md` (Known-agent x402 rollout: curated Honest/Cheat discovery, Identity registration, x402 readiness/proof path; completed card-catalog rollout is superseded).
- All router wire types live in `apps/router/src/contract.ts` — import from there and coordinate before changing shared shapes.
- Shared state lives in `ctx` (built by `context.ts`) — use the Maps, don't create your own stores.
- Active router identity language is **Agent**. `agent_id` means the router-stable selected-agent id `algorand:{net}:{address}`; `registry_agent_id` means the IdentityRegistry uint64 when available.
- Wire your routes into your stub file, not into `router-server.ts`
- Live TestNet identity operator setup: `npm run setup:testnet-identity` / `npm run setup:testnet-known-agents` writes or checks local ignored `.env` (`IDENTITY_APP_ID`, `IDENTITY_SUBMITTER_MNEMONIC`), prints `IDENTITY_SUBMITTER_ADDRESS`, balance, and next registration command when the pre-funded submitter is present; setup never registers agents. Batch mint is explicit via `npm run register:testnet-agents`; `npm start` only loads `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json` evidence and never mints IdentityRegistry records.
- Current identity preflight status (2026-06-07): submitter `ABAS5P7RW6JSZKFACWWKGNOIR5HCA2WXBTANZU4GIU7JBWOGRW6TSVLBKU` has `13.996 ALGO`; `npm run setup:testnet-identity -- --check`, alias `setup:testnet-known-agents -- --check`, and `npm run register:testnet-agents -- --check` all PASS without sending registration txs.
- Current TestNet smoke status (2026-06-07): **live x402 end-to-end demo PASSED** (see the "x402 end-to-end live demo" section at the top for txids/explorer/reputation). After the run the shared demo payer `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI` reads `0.648 ALGO` total / `0.0055 ALGO` available — re-fund before the next run.
- Low-spend proof smoke mode: start with `LOW_SPEND_SMOKE=true npm start`; boot skips agents with available balance >= `AGENT_MIN_AVAILABLE_ALGO` (default `0.1`) and aborts instead of funding underfunded wallets. Proof APIs accept `user_id` (= payer Algorand address) and `settlement_txid` aliases. Spending runner: `npm run smoke:testnet:proof` (Cheat-only, direct settlement + 0-ALGO auth, rejects duplicate feedback).

---

## Navid — Payment + Integration ✅ DONE + VERIFIED ON TESTNET

**What's ready for you to use:**

- `ctx.paymentStore: Map<payment_id, PaymentResult>` — every payment that went through `/api/pay`
- `ctx.ledger: LedgerEntry[]` — every anchored transaction, hash-only
- `ctx.deps.anchorNote(ref_id, schema, hash)` — write a hash-only note to Algorand, returns `{ txid, round }`
- `ctx.deps.settle(to, amountAlgo, note)` — send an actual Algorand payment, returns `{ txid, round }`
- `ctx.deps.explorerFor(txid)` — returns a block explorer URL for any txid

**Live endpoints — verified with real LocalNet txids:**

```
POST /api/pay       { route_id, option_id } → { payment_id, agent_id, quote_id, txids, quoted_amount, settled_amount, read }
GET  /api/ledger    → { anchors: [{ txid, schema, ref_id, hash, round, network }] }
```

**Verified behaviour:**

- Honest agent: `settled == quoted`, 1 txid confirmed on-chain
- Cheat agent: `settled > quoted` (0.04 quoted → 0.06 settled quote drift), 1 settlement txid confirmed
- Ledger: both payments anchored hash-only with real round numbers

**To run (TestNet — default, zero setup):**

```bash
# One-time: fund the shared payer from `.env.demo` via the dispenser:
#   24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI
# e.g.  algokit dispenser fund -r 24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI -a 10000000
npm start                # boots on TestNet, funds discovered agents, prints option_ids
```

- **Default network is TestNet.** `.env.demo` carries the shared throwaway payer mnemonic so anyone can `npm start` with no local `.env` and get real on-chain txids. TestNet ALGO is valueless; the key is public on purpose — never reuse on MainNet.
- Boot calls idempotent `fundAgents`: funded wallets are skipped; underfunded wallets receive `AGENT_FUND_ALGO` (default `0.5`) unless `LOW_SPEND_SMOKE=true`, where boot aborts before any top-up.
- Current TestNet smoke status (2026-06-07): **live x402 end-to-end run PASSED** — Honest settled at quote (0.1 = 0.1, `UV6CKKDHRWMRIUXDZEFERQPK53SQODH5BOC2QYPDKNH5VJSRWZ7Q`) and Cheat settled above quote (0.06 > 0.04, `AHVU2VCAIF26ZNJX6YQT5WIF2CPJPBR2MJMA5BJZIWYDMUMPL4UQ`), both `confirmed`; ledger anchored hash-only. After the run shared payer `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI` reads `0.648 ALGO` total / `0.0055 ALGO` available — re-fund before the next run.
- Explorer links resolve to `lora.algokit.io/testnet/transaction/<txid>`.
- LocalNet still works with local overrides for `ALGO_NETWORK`, `ALGOD_URL`, `ALGOD_PORT`, and `ALGOD_TOKEN`; set a private payer only if you intentionally do not want the public TestNet demo payer.

**To run (LocalNet):**

```bash
algokit localnet start   # Docker must be running
npm start                # funds agents automatically, prints option_ids on boot
```

**3 demo agents seeded at startup** as fallback only; card-backed Honest/Cheat wallets are stable in `docs/agents/testnet/*.json`:

- 🟢 Honest Agent — 0.1 ALGO, honest
- 🟢 Budget Agent — 0.07 ALGO, honest
- 🔴 Cheat Agent — 0.04 ALGO quoted, 0.06 settled (quote drift)
- Live `route → pay` confirmed: `route_id` from Reza's `/api/route` resolves in `/api/pay` (bogus id → 400, real id → settle). _(The old TEMP `/api/route` stub was removed in d9c303c.)_

---

## Reza — Identity Registry + Demo Discovery + Ranking 🟢 CARD CATALOG + PHASE 3 402 QUOTES WIRED

`POST /api/route`, `GET /api/agents`, and `GET /api/services` live (`routes.agents.ts` + `agents.ts`,
with `agents.test.ts`). Discovery now has seeded fallback plus Honest/Cheat ARC-8004 card ingestion from
`docs/agents/testnet/manifest.json` or direct canonical card URLs. Cards are clean ARC-8004 identity/service
facts only; the router owns the `diligence.report` proxy mapping. Card-backed quotes now come from local
MCP/x402 402 probes, not router-authored Honest/Cheat quote maps. Full chain scan, MCP tool-list parsing,
and A2A cards remain open.
Current ranking is in `agents.ts::discoveryOptions` (`ranking.ts` is an unused stub). On-chain Identity registry below.

**Chain identity registry:**

- `contracts/identity_registry/contract.algo.ts` → `IdentityRegistry`
- Canonical protocol identity: `{ agentRegistry: algorand:{genesisHashPrefix}:{identityAppId}, agentId:uint64 }`; router exposes this as `registry_agent_id`.
- `register(agentURI, metadata)` → protocol `agentId` / router `registry_agent_id`; owner=`Txn.sender`; `agentWallet=Txn.sender`
- ARC-72 reads/writes: `arc72_ownerOf`, `arc72_transferFrom`, `arc72_tokenURI`, `arc72_approve`, `arc72_setApprovalForAll`, `arc72_getApproved`, `arc72_isApprovedForAll`, `arc72_balanceOf`, `arc72_totalSupply`, `arc72_tokenByIndex`
- ERC-8004 reads/writes: `getAgentURI`, `setAgentURI`, `getMetadata`, `setMetadata`, `getAgentWallet`, `setAgentWallet`, `unsetAgentWallet`
- ARC-73: `supportsInterface` for ARC-73 + ARC-72 core/metadata/transfer/enumeration
- Deploy: `contracts/identity_registry/deploy-config.ts`; client/artifacts in `contracts/artifacts/identity_registry/`
- Deploy path: `npm run build && npm run deploy:localnet` includes `identity_registry`
- Router identity: `agentId(net,address)` → `algorand:{net}:{address}`

**Live endpoints:**

```
GET  /api/agents → { network, app_id, agents:[{ agent_id, registry_agent_id?, agent_uri, agent_wallet, services }] }
GET  /api/services → { network, generated_at, services:[{ service_id, name, description, proxy, options }] }
POST /api/route { task, service_id? } → { route_id, task, service_id, options:[RouteOption] }
POST /mcp → Claude Code MCP tools over Streamable HTTP
```

**Honest/Cheat card URLs:**

- Manifest: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/manifest.json`
- Honest: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/honest-agent.json`
- Cheat: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/cheat-agent.json`
- Local demo MCP endpoints: Honest `http://localhost:4021/honest/mcp`; Cheat `http://localhost:4021/cheat/mcp`.
- URL status: local Honest/Cheat card files and raw GitHub URLs are clean ARC-8004 cards; known Honest/Cheat service endpoints are normalized to local `:4021` demo providers by default (`LOCAL_X402_AGENT_BASE_URL=card` disables that override). Runtime still falls back to direct card URLs if the manifest is unavailable.
- Local provider tool: `answer_obvious_claim`; description `Return whether the claim "2 + 2 = 4" is true.`; paid Honest returns `true`; paid Cheat returns `false`.
- Phase 1 known-agent setup: `npm run setup:testnet-identity` or alias `npm run setup:testnet-known-agents` only prepares/checks the identity operator and prints next steps.
- Phase 1 known-agent batch registration: `npm run register:testnet-agents` registers only the canonical Honest/Cheat card URLs, calls `setAgentWallet`, and writes `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json`; use `--check` for no-tx preflight.
- Required order: `npm run setup:testnet-identity` (or `setup:testnet-known-agents`) → `npm run setup:testnet-identity -- --check` → `npm run register:testnet-agents -- --check` → `npm run register:testnet-agents` → `npm start` to consume evidence.
- Phase 1 known-agent evidence: DONE 2026-06-07 in `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json`; owner `ABAS5P7RW6JSZKFACWWKGNOIR5HCA2WXBTANZU4GIU7JBWOGRW6TSVLBKU`; Honest `registry_agent_id=1` (`register_tx=ZQ4VZVKAHKPTA7GZSGRFZ7CF3EPXSF3G4IBG5UWPWTPLOTF2WVAQ`, `wallet_tx=G6M6XS6NK2Y3K4DI66KDPD64PZCWYPYCOOM7OKJ73HM6TXSYFQWQ`); Cheat `registry_agent_id=2` (`register_tx=IO4QNVCWR6MRWCUJDLNDWUA2ZIJ35OXQLK4ITX76EPLTGSETQSYQ`, `wallet_tx=MWI56EUVNEUJWNXOJGT2KPLYYMKO7QS6LZHDSPWR3OQB5MKQEZUA`).
- 2026-06-07 card deploy rerun: raw Honest/Cheat cards verified; `register:testnet-agents` skipped existing `registry_agent_id=1/2`; no new txs.
- `npm start` no longer runs registration. It calls `applyKnownAgentRegistrations(ctx)` after card ingestion so `GET /api/agents` + `GET /api/services` expose `registry_agent_id` only when evidence is recorded.

**What teammates can consume:**

- `agentId(net,address)` → `algorand:{net}:{address}`
- `registerAgentLocal(ctx,input)` stores identity-only `Agent` in `ctx.agents`
- `registerServiceLocal(ctx,input)` stores resolved MCP/A2A services; `quote` is optional for card-backed endpoint facts
- `parseAgentCard(raw, agent_uri)` validates clean ARC-8004 card shape: `type`, active/x402 flags, `MCP`, and `algorand-wallet`
- `ingestAgentCardsFromManifest(ctx)` fetches manifest/cards, falls back to direct Honest/Cheat URLs, and replaces seeded `diligence.report` on success; card-backed services store endpoint facts only; full fetch failure keeps seeded fallback
- `knownAgentRegistrationTargets(ctx)` returns exactly card-backed Honest/Cheat targets; seeded fallback returns none
- `applyKnownAgentRegistrations(ctx)` maps committed evidence into `registryAgentIdFor(agent_id)` without on-chain writes
- `ctx.quoteCache: Map<agent_id::service_id, QuoteSnapshot>` stores pre-probed quote-mode 402 snapshots; warmup runs after card ingestion and lazy refresh runs on `/api/services` + `/api/route`.
- `fetchPaymentRequirementFromService(service, request)` calls MCP/x402 endpoint and parses 402 `accepts[0]` into `{ amount, asset, pay_to, network?, resource?, nonce?, expires_at? }`
- `refreshQuotes(ctx, service_id?)` probes discovered services into `ctx.quoteCache`; failed agents are skipped non-fatally.
- `paymentRequirementForExecution(ctx, option)` asks the selected agent endpoint for execution-mode 402; Honest returns `0.10`, Cheat returns `0.06`
- `buildServicesCatalog(ctx, registryAgentIdFor)` returns grouped `/api/services` payload from fresh cached quote snapshots; no `challenge_*` fields
- `/api/route` ranks from fresh `ctx.quoteCache` snapshots; missing/stale quotes are refreshed first, then route-specific `ActiveQuote`/`PaymentRequirement` records are minted.
- `PaymentChallenge` type is live in `contract.ts`; `challengeStore` holds short-lived challenge sessions for `/api/challenge` + `/api/payment-proof`
- `ActiveQuote` now includes `observed_at` + `expires_at`
- `/api/route` stores:

```ts
ctx.routeStore.set(route_id, {
  route_id,
  task,
  service_id,
  options: RouteOption[],  // see contract.ts for the shape
});
```

- `/api/pay` looks up `route_id` from `ctx.routeStore` — if it's not there, pay returns 400
- Legacy `/api/pay` now uses `paymentRequirementForExecution(ctx, option)` before router-settled shim payment, so drift behavior lives in the local agent server.
- `routes.agents.ts::createRoute(ctx,{task,service_id?})` is the shared route creation helper used by REST and MCP.
- `routes.mcp.ts::invokePaidService(ctx,challenge_id,payload?)` forwards accepted proof challenges to the selected provider with `X-PAYMENT:<payment_txid>`.

**Where to write your code:**

- Routes → `apps/router/src/routes.agents.ts` → inside `makeAgentRoutes(ctx)`
- Logic → `apps/router/src/agents.ts`
- Removed the old discovery compatibility surface; active discovery is `GET /api/agents`, `Agent`, `AgentService`, active quotes, and `agent_id`.

---

## Shayaun — Reputation Registry + Validation Registry ✅ PROOF ROUTER GLUE WIRED

- Live legacy shim validation: `POST /api/validate {payment_id}` → `{validation_id, price_match, output_pass:null, response, new_reputation, verdict_txid}`; this is automatic quote-vs-settlement validation, not user feedback. `GET /api/reputation?agent=` → `{agent_id, score, reads_logged, corrections_logged, by_tag, uri, hash}`.
- Live proof path: `POST /api/challenge {route_id, option_id}` → execution x402 challenge + `payment_note` + `quote_drift`; `GET /api/challenge/:challenge_id` returns stored challenge/signing facts; `POST /api/payment-proof {challenge_id, settlement_txid|txid, user_id|payer}` verifies confirmed payment sender/receiver/amount/network/note and lowers reputation only for quote drift; `POST /api/feedback/intent {challenge_id, settlement_txid|payment_txid, user_id|payer, response}` returns a 0-ALGO self-payment auth note; `POST /api/feedback {feedback_intent_id, auth_txid}` accepts payer-authorized feedback, dedupes payment txids, updates `ctx.repState`, and optionally pays `FEEDBACK_REBATE_ALGO` when `FEEDBACK_REBATE_ENABLED=true`.
- `makeValidationRoutes(ctx)` **injects `ctx.repState`** (in-memory effective reputation: prior score `60`, prior weight `3`, blended with observed clean/corrected reads) so `/api/route` reranks after a write-back without one-event route death — no `router-server.ts` change needed.
- Verdict anchored hash-only via `ctx.deps.anchorNote` (real txid on LocalNet; skipped if algod down).
- On-chain registries deploy via new `contracts/{reputation,validation}_registry/deploy-config.ts` (`npm run deploy`).
- **Registry helpers available:** `onchain.ts::maybeWriteValidation` writes ValidationRegistry request/response for proof policy evidence when `VALIDATION_SUBMITTER_MNEMONIC` is configured; otherwise proof evidence is hash-anchored. `onchain.ts::maybeWriteReputation` writes ReputationRegistry `giveFeedback` only when the configured signer matches the proven payer; otherwise verified feedback is hash-anchored and the client-side/Pera registry write remains the honest next step. `/api/validate` and `/api/payment-proof` do not write quote drift through `giveFeedback`.
- ✅ Contract side LANDED (cross-lane, at owner's request): `giveFeedback` now takes mandatory `paymentTxid: byte[32]` + `nonce: uint64`, rejects an all-zero proof, and replay-guards each settlement to one feedback (new tests in `reputation-registry.spec.ts`, all green). Recompiled + deployed as Reputation `764031363`.
- `onchain.ts` feedback helper: `maybeWriteReputation(ctx, agent_id, response, paymentTxid, payer, nonce, "user_feedback")` passes `paymentTxid` (real x402 settlement txid -> 32 bytes via base32 decode) + nonce, uses the Identity `registry_agent_id` loaded from known-agent evidence when present, and refuses to backend-sign as anyone except the proven payer.
- Router glue tests cover quote-vs-settlement validation, proof challenge creation, proof rejection cases, quote-drift reputation drop/reroute, payer self-auth feedback, feedback replay guard, rebate, reputation score math, correction tags, reroute hook, and per-agent isolation. Run with `npm test`. Pure logic, no network.
- Shared proof helpers: `createPaymentChallenge`, `getPaymentChallenge`, `paymentChallengePayload`, and `acceptPaymentProofForChallenge` in `routes.trust.ts`; REST and MCP both use them.

**What's ready for you to consume:**

- `ctx.paymentStore.get(payment_id)` → `{ payment_id, agent_id, quote_id, quoted, settled, txids, read }` — use `quoted` vs `settled` for quote-drift validation
- `ctx.deps.anchorNote(ref_id, schema, hash)` — anchor your verdict hash-only on-chain

**What Navid needs from you:**

- Pass your `repState` into `buildContext(repState)` in `router-server.ts` when you're ready:

```ts
import { createRepState } from "../src/reputation-state.js";
const repState = createRepState();
const ctx = await buildContext(repState);
```

- Reza's ranking reads `ctx.repState.getReputation(agent_id)` — make sure `createRepState()` implements that

**Where to write your code:**

- Routes → `apps/router/src/routes.validation.ts` → inside `makeValidationRoutes(ctx)`
- Logic → `apps/router/src/validation.ts` and `apps/router/src/reputation-state.ts`

**When you're done, update this section with your live endpoints.**

---

## Shruti — UI + Narrative ✅ MULTI-PAGE CONSOLE + SIDEBAR

- **5 pages behind a left in-frame sidebar** (`apps/web/nav.js` + `nav.css`): **Trust Router** (`router.html`), **Marketplace** (`marketplace.html`), **Agent Studio** (`studio.html`), **Contracts** (`contracts.html`), **Admin** (`admin.html`). One engine: `registry.js` + `arc8004.js` drive each page by `body[data-view]`; `router.{html,js,css}` is the trust-router flow.
- **Live wiring:** `router.js` top — `const LIVE = { route, pay, validate, reputation, ledger, challenge, paymentProof, feedbackIntent, feedback }` (all true), `BASE_URL='http://localhost:3001'`, graceful per-endpoint mock fallback + server health probe. The ARC-8004 console (`arc8004.js`) is mock-first (no backend endpoints for the raw registries yet).
- Open via a static server (not `file://`, so vendored CSS/fonts + clipboard work). CORS is handled by the router-server.
- Agent identity + before-score sourced from the picked RouteOption (never from pay/validate). Failures surface as a red toast.
- **Pera Wallet** (`apps/web/wallet.js`, ESM module, no build): shared client across all pages. Loads `@perawallet/connect` + `algosdk@3` from esm.sh. `window.WALLET.{account,isConnected,connect,disconnect,signAndSend,payment}`; fires `wallet:change`/`wallet:ready`/`wallet:error` on `window`; any `[data-pera-connect]` element is an auto-labelled connect/disconnect toggle. Connected address mirrored in `localStorage` so pages share it.
  - Router: connected wallet → operator wallet in `proof_of_payment.from`; signed-packet shows **⚿ Sign on TestNet (Pera)** → a real 0-ALGO self-anchor txn carrying the settlement ref, added to ledger as `x402.settle.pera`.
  - Registry/Marketplace/Studio: connect → `ARC8004.setCaller(address)` (acts as that wallet; disconnect reverts to a fresh demo addr).
  - **Network = TestNet, pinned everywhere — never switched.** `router.js NETWORK` and `arc8004.js NET` are hardcoded `"testnet"`; the `nav.js`/`registry.js` fallbacks are also `"testnet"`, matching `wallet.js` and `context.ts`'s TestNet default. Explorer/genesis/banner all resolve to TestNet. Real Pera signing needs the Pera mobile app paired + TestNet funds.
  - **Required on every page that loads `wallet.js`:** an `<script type="importmap">` redirecting `https://esm.sh/js-sha3@0.8.0/es2022/js-sha3.mjs` → `/vendor/js-sha3-shim.js` (in `<head>`, before the module). esm.sh's `js-sha3` build only default-exports, so Pera's `import { keccak_256 }` fails without the shim. Wired into: `router.html`, `marketplace/studio/contracts/admin.html`. `wallet.js` auto-injects its Connect button into `.surface-meta`/titlebar if a page has no static `[data-pera-connect]`.
- **MCP signing bridge:** `apps/web/mcp-sign.html` + `mcp-sign.js` read `challenge_id` and optional `api_base`, load `GET /api/challenge/:challenge_id`, sign `pay_to`/`amount`/`payment_note` through `wallet.js`, and post `/api/payment-proof`. Used by `liminal_request_payment.sign_url`.

**All endpoints consumed (live):** `POST /api/route`, `POST /api/challenge`, `POST /api/payment-proof`, `POST /api/feedback/intent`, `POST /api/feedback`, `POST /api/pay`, `POST /api/validate`, `GET /api/reputation`, `GET /api/ledger`, `GET /api/agents`.

**Proof-path UI (NEW · 2026-06-07):** `router.js doApprove` now drives `/api/challenge → /api/payment-proof` (+ `/api/feedback/intent → /api/feedback` via a **✓ Leave verified review** button), surfacing the agent wallet, x402 nonce, note-binding, payment txid, validation evidence (on-chain ValidationRegistry or hash anchor), policy result, and reputation. **Demo settle is synthesized (no real spend)** by default; the legacy `pay/validate` loop is the automatic fallback and mock fallback covers offline. _@Reza: consumes your proof endpoints as-is — no router changes. Real no-custody Pera vendor payment (`w.payment` → agent `pay_to`) is the opt-in next step; coordinate before adding a UI real-payment path so we don't double-build._

**Current demo beat:** ranked agents → x402 challenge (gap in red if charge > quote) → payment proof + automatic validation (verdict + reputation delta, hash-anchored) → re-run shows the trust penalty in ranking (caught agent drops). _(Legacy router-settled `pay/validate` shim remains the fallback.)_

**Target demo beat:** ranked agents → active quote pinned → agent x402 challenge asks more → payment settles for challenge → automatic validation lowers effective reputation → re-run shows trust penalty in ranking. Pitch script/deck/storyboard in `docs/pitch/`.

**Agent registration surface (NEW — registers agents on the deployed Identity registry):**
```
POST /api/agents/register { name, agent_uri, address }
     → { agent_id, registry_agent_id?, tx_id, app_id, owner, agent_uri, explorer, on_chain }
GET  /api/agents → { network, app_id, agents:[{ agent_id, registry_agent_id?, agent_uri, agent_wallet, services }] }
```
Server: `routes.agents.ts` + `identity-onchain.ts` (`registerAgent` for manual POST, `npm run register:testnet-agents` for Honest/Cheat batch). On boot, no on-chain registration runs; known-agent evidence is mapped from `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json` into `agent_id → registry_agent_id`. Mounted via `app.route('/', makeAgentRoutes(ctx))`. Uses Reza's `register(string,(string,byte[])[])→uint64` ABI (verified against the generated client). Env vars: `.env.demo` + optional `.env`. Spec: `docs/specs/TESTNET_AGENT_REGISTRATION_SPEC_2026-06-06.md`. _(No-impersonation reconciled with Pera: `setCaller` honors a real connected wallet, else pins to the fixed operator wallet.)_
