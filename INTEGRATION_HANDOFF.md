# Integration Handoff — x402 Trust Router

Live doc. Each engineer updates their section when they land code.
Everyone's Claude should read this before writing anything.

## Current state (origin/main) — core loop landed ✅

- **Endpoints live on `:3001`:** `POST /api/route`, `POST /api/challenge`, `POST /api/payment-proof`, `POST /api/feedback/intent`, `POST /api/feedback`, `POST /api/pay`, `POST /api/validate`, `GET /api/reputation`, `GET /api/ledger`, `GET /api/agents`, `GET /api/services`.
- **On-chain:** ARC-8004 Identity + Reputation + Validation registries (Algorand TS) with deploy configs, unit specs, and `scripts/localnet-e2e.ts`.
- **✅ DEPLOYED ON TESTNET (wired):** Identity `764031067`, Reputation `764031363`, Validation `764031094` — both Reputation & Validation are `initialize()`'d so their global `idApp` = `764031067` (verified on-chain). Reputation `764031363` ships the x402 `giveFeedback` coupling (supersedes earlier `764031075`). Deployer/creator = shared payer `24E3…`. **See `docs/status/DEPLOYED.md`** for code hashes + creation txids; app ids also in `apps/web/deployed.testnet.json`; UI (`arc8004.js`) consumes them. Redeploy: `npm run deploy:testnet` (orchestrator: `scripts/deploy-testnet.ts`, idempotent via indexer).
- **Frontend:** 5 pages + a left sidebar (Trust Router · Marketplace · Agent Studio · Contracts · Admin) under `apps/web/`.
- **Open follow-ups:** Honest/Cheat ARC-8004 card catalog + local 402 quote ingestion are wired; proof-backed `/api/challenge` -> `/api/payment-proof` and payer-authorized `/api/feedback` are wired in the router; full chain scan/MCP tool-list/A2A discovery is not wired; `/api/pay` still exists as the router-settled demo shim; registry writes are env-gated with hash-anchor fallback; UI has not consumed the new proof endpoints yet; `apps/router/src/ranking.ts` is an unused stub (ranking lives in `agents.ts::discoveryOptions`). _(The TEMP `/api/route` stub was removed in d9c303c.)_

---

## Shared context

- Server runs on `:3001` — `npm start` from project root. **Defaults to TestNet** via committed `.env.demo` (shared throwaway payer + deployed app ids); local `.env` is optional for non-secret network/port overrides.
- Local demo x402 providers run on `:4021` — `npm run agents:local`; endpoints: `POST /honest/mcp`, `POST /cheat/mcp`.
- Markdown source of truth: `README.md` (run/status), `BUILD_CHECKLIST_2026-06-06.md` (done/left tracker), `docs/reference/END_TO_END_HACK_SCOPE_2026-06-06.md` (demo scope), `apps/web/README.md` (frontend), `docs/pitch/*` (submission), `docs/reference/ERC8004_AVM_MAPPING.md` + `docs/reference/ARC-8004.md` (standards).
- Temporary execution handoff: `docs/status/TESTNET_AGENT_ROLLOUT_TEMP.md` (Known-agent x402 rollout: curated Honest/Cheat discovery, Identity registration, x402 readiness/proof path; completed card-catalog rollout is superseded).
- All router wire types live in `apps/router/src/contract.ts` — import from there and coordinate before changing shared shapes.
- Shared state lives in `ctx` (built by `context.ts`) — use the Maps, don't create your own stores.
- Active router identity language is **Agent**. `agent_id` means the router-stable selected-agent id `algorand:{net}:{address}`; `registry_agent_id` means the IdentityRegistry uint64 when available.
- Wire your routes into your stub file, not into `router-server.ts`
- Live TestNet identity operator setup: `npm run setup:testnet-identity` / `npm run setup:testnet-known-agents` writes or checks local ignored `.env` (`IDENTITY_APP_ID`, `IDENTITY_SUBMITTER_MNEMONIC`), prints `IDENTITY_SUBMITTER_ADDRESS`, balance, and next registration command when the pre-funded submitter is present; setup never registers agents. Batch mint is explicit via `npm run register:testnet-agents`; `npm start` only loads `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json` evidence and never mints IdentityRegistry records.
- Current identity preflight status (2026-06-07): submitter `ABAS5P7RW6JSZKFACWWKGNOIR5HCA2WXBTANZU4GIU7JBWOGRW6TSVLBKU` has `13.996 ALGO`; `npm run setup:testnet-identity -- --check`, alias `setup:testnet-known-agents -- --check`, and `npm run register:testnet-agents -- --check` all PASS without sending registration txs.
- Current TestNet smoke status (2026-06-07): direct algod query shows shared demo payer `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI` at `2.657 ALGO` total / `2.0145 ALGO` available; `npm start` / live smoke not rerun yet because it spends TestNet funds.

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
- Boot calls `fundAgents` (0.5 ALGO each; normally 2 card-backed agents = ~1.0 ALGO/restart, seeded fallback = ~1.5 ALGO/restart), so **the payer must be funded first or boot fails.** Dispense ~10 ALGO; top up if it runs dry.
- Current TestNet smoke status (2026-06-07): shared payer `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI` now reads `2.657 ALGO` total / `2.0145 ALGO` available by direct algod query; identity submitter `ABAS5P7RW6JSZKFACWWKGNOIR5HCA2WXBTANZU4GIU7JBWOGRW6TSVLBKU` reads `13.996 ALGO`; `npm start` was not rerun because it spends TestNet funds through `fundAgents`.
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
```

**Honest/Cheat card URLs:**

- Manifest: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/manifest.json`
- Honest: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/honest-agent.json`
- Cheat: `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/cheat-agent.json`
- Local demo MCP endpoints: Honest `http://localhost:4021/honest/mcp`; Cheat `http://localhost:4021/cheat/mcp`.
- URL status: local Honest/Cheat card files and raw GitHub URLs are clean ARC-8004 cards; known Honest/Cheat service endpoints are normalized to local `:4021` demo providers by default (`LOCAL_X402_AGENT_BASE_URL=card` disables that override). Runtime still falls back to direct card URLs if the manifest is unavailable.
- Phase 1 known-agent setup: `npm run setup:testnet-identity` or alias `npm run setup:testnet-known-agents` only prepares/checks the identity operator and prints next steps.
- Phase 1 known-agent batch registration: `npm run register:testnet-agents` registers only the canonical Honest/Cheat card URLs, calls `setAgentWallet`, and writes `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json`; use `--check` for no-tx preflight.
- Required order: `npm run setup:testnet-identity` (or `setup:testnet-known-agents`) → `npm run setup:testnet-identity -- --check` → `npm run register:testnet-agents -- --check` → `npm run register:testnet-agents` → `npm start` to consume evidence.
- Phase 1 known-agent evidence: DONE 2026-06-07 in `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json`; owner `ABAS5P7RW6JSZKFACWWKGNOIR5HCA2WXBTANZU4GIU7JBWOGRW6TSVLBKU`; Honest `registry_agent_id=1` (`register_tx=ZQ4VZVKAHKPTA7GZSGRFZ7CF3EPXSF3G4IBG5UWPWTPLOTF2WVAQ`, `wallet_tx=G6M6XS6NK2Y3K4DI66KDPD64PZCWYPYCOOM7OKJ73HM6TXSYFQWQ`); Cheat `registry_agent_id=2` (`register_tx=IO4QNVCWR6MRWCUJDLNDWUA2ZIJ35OXQLK4ITX76EPLTGSETQSYQ`, `wallet_tx=MWI56EUVNEUJWNXOJGT2KPLYYMKO7QS6LZHDSPWR3OQB5MKQEZUA`).
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

**Where to write your code:**

- Routes → `apps/router/src/routes.agents.ts` → inside `makeAgentRoutes(ctx)`
- Logic → `apps/router/src/agents.ts`
- Removed the old discovery compatibility surface; active discovery is `GET /api/agents`, `Agent`, `AgentService`, active quotes, and `agent_id`.

---

## Shayaun — Reputation Registry + Validation Registry ✅ PROOF ROUTER GLUE WIRED

- Live legacy shim validation: `POST /api/validate {payment_id}` → `{validation_id, price_match, output_pass:null, response, new_reputation, verdict_txid}`; this is automatic quote-vs-settlement validation, not user feedback. `GET /api/reputation?agent=` → `{agent_id, score, reads_logged, corrections_logged, by_tag, uri, hash}`.
- Live proof path: `POST /api/challenge {route_id, option_id}` → execution x402 challenge + `payment_note` + `quote_drift`; `POST /api/payment-proof {challenge_id, txid, payer}` verifies confirmed payment sender/receiver/amount/network/note and lowers reputation only for quote drift; `POST /api/feedback/intent {challenge_id, payment_txid, payer, response}` returns a 0-ALGO self-payment auth note; `POST /api/feedback {feedback_intent_id, auth_txid}` accepts payer-authorized feedback, dedupes payment txids, updates `ctx.repState`, and optionally pays `FEEDBACK_REBATE_ALGO` when `FEEDBACK_REBATE_ENABLED=true`.
- `makeValidationRoutes(ctx)` **injects `ctx.repState`** (in-memory; score = (landed−corrected)/landed) so `/api/route` reroutes after a write-back — no `router-server.ts` change needed.
- Verdict anchored hash-only via `ctx.deps.anchorNote` (real txid on LocalNet; skipped if algod down).
- On-chain registries deploy via new `contracts/{reputation,validation}_registry/deploy-config.ts` (`npm run deploy`).
- **Registry helpers available:** `onchain.ts::maybeWriteValidation` writes ValidationRegistry request/response for proof policy evidence when `VALIDATION_SUBMITTER_MNEMONIC` is configured; otherwise proof evidence is hash-anchored. `onchain.ts::maybeWriteReputation` writes ReputationRegistry `giveFeedback` only when the configured signer matches the proven payer; otherwise verified feedback is hash-anchored and the client-side/Pera registry write remains the honest next step. `/api/validate` and `/api/payment-proof` do not write quote drift through `giveFeedback`.
- ✅ Contract side LANDED (cross-lane, at owner's request): `giveFeedback` now takes mandatory `paymentTxid: byte[32]` + `nonce: uint64`, rejects an all-zero proof, and replay-guards each settlement to one feedback (new tests in `reputation-registry.spec.ts`, all green). Recompiled + deployed as Reputation `764031363`.
- `onchain.ts` feedback helper: `maybeWriteReputation(ctx, agent_id, response, paymentTxid, payer, nonce, "user_feedback")` passes `paymentTxid` (real x402 settlement txid -> 32 bytes via base32 decode) + nonce, uses the Identity `registry_agent_id` loaded from known-agent evidence when present, and refuses to backend-sign as anyone except the proven payer.
- Router glue tests cover quote-vs-settlement validation, proof challenge creation, proof rejection cases, quote-drift reputation drop/reroute, payer self-auth feedback, feedback replay guard, rebate, reputation score math, correction tags, reroute hook, and per-agent isolation. Run with `npm test`. Pure logic, no network.

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
- **Live wiring:** `router.js` top — `const LIVE = { route, pay, validate, reputation, ledger }` (all true), `BASE_URL='http://localhost:3001'`, graceful per-endpoint mock fallback + server health probe. The ARC-8004 console (`arc8004.js`) is mock-first (no backend endpoints for the raw registries yet).
- Open via a static server (not `file://`, so vendored CSS/fonts + clipboard work). CORS is handled by the router-server.
- Agent identity + before-score sourced from the picked RouteOption (never from pay/validate). Failures surface as a red toast.
- **Pera Wallet** (`apps/web/wallet.js`, ESM module, no build): shared client across all pages. Loads `@perawallet/connect` + `algosdk@3` from esm.sh. `window.WALLET.{account,isConnected,connect,disconnect,signAndSend,payment}`; fires `wallet:change`/`wallet:ready`/`wallet:error` on `window`; any `[data-pera-connect]` element is an auto-labelled connect/disconnect toggle. Connected address mirrored in `localStorage` so pages share it.
  - Router: connected wallet → operator wallet in `proof_of_payment.from`; signed-packet shows **⚿ Sign on TestNet (Pera)** → a real 0-ALGO self-anchor txn carrying the settlement ref, added to ledger as `x402.settle.pera`.
  - Registry/Marketplace/Studio: connect → `ARC8004.setCaller(address)` (acts as that wallet; disconnect reverts to a fresh demo addr).
  - **Network = TestNet, pinned everywhere — never switched.** `router.js NETWORK` and `arc8004.js NET` are hardcoded `"testnet"`; the `nav.js`/`registry.js` fallbacks are also `"testnet"`, matching `wallet.js` and `context.ts`'s TestNet default. Explorer/genesis/banner all resolve to TestNet. Real Pera signing needs the Pera mobile app paired + TestNet funds.
  - **Required on every page that loads `wallet.js`:** an `<script type="importmap">` redirecting `https://esm.sh/js-sha3@0.8.0/es2022/js-sha3.mjs` → `/vendor/js-sha3-shim.js` (in `<head>`, before the module). esm.sh's `js-sha3` build only default-exports, so Pera's `import { keccak_256 }` fails without the shim. Wired into: `router.html`, `marketplace/studio/contracts/admin.html`. `wallet.js` auto-injects its Connect button into `.surface-meta`/titlebar if a page has no static `[data-pera-connect]`.

**All endpoints consumed (live):** `POST /api/route`, `POST /api/pay`, `POST /api/validate`, `GET /api/reputation`, `GET /api/ledger`, `GET /api/agents`, `GET /api/state`.

**"Inside the router" inspector (NEW — consumes `GET /api/state`):** titlebar pill `◇ inside` (and `i` key) on `router.html` opens the shared `#ledgerModal` via `openState()` in `router.js`. Reuses the `.lm-*` row chrome verbatim; sections = Agents·reputation, Payments (quoted→settled drift), Challenges (quote vs x402 ask), Recent anchors — each row carries a `verify ↗` explorer link. Mock-first: `mockApi.state()` synthesizes the snapshot from mock backend state so the inspector populates with the server offline.

**Router state snapshot (NEW — read-only inner-workings feed for the UI):**
```
GET /api/state → {
  network, generated_at,
  counts:{ agents, payments, challenges, anchors },
  agents:[{ agent_id, name, registry_agent_id?, agent_wallet, reputation:{ score, reads_logged, corrections_logged, by_tag }|null }],
  payments:[{ payment_id, agent_id, quote_id, quoted, settled, drift, over_quote, txids, explorer, read }],
  challenges:[{ challenge_id, agent_id, route_id, quote_amount, challenge_amount, quote_drift, pay_to, payment_note, payment_txid?, explorer?, validation_txid? }],
  active_quotes:[{ quote_id, agent_id, service_id, amount, asset, pay_to, observed_at, expires_at }],
  ledger:[{ txid, schema, ref_id, hash, round, network, explorer }]
}
```
Read-only serializer of the in-memory `ctx` Maps that the per-call responses never expose (payments, challenges, active quotes), with each record carrying its on-chain anchor txid + `explorer` URL where one exists. Server: `apps/router/src/routes.state.ts` (`makeStateRoutes(ctx)`); composed in `router-server.ts` via `app.route('/', makeStateRoutes(ctx))` (one line, alongside the other teammate factories). No mutation — pure read of shared state; reputation is feature-detected via `repState.full()`. Tests: `apps/router/src/routes.state.test.ts` (8 in-process `app.request('/api/state')` cases — empty state, reputation full()+by_tag, getReputation fallback, payment drift/explorer, challenge quote_drift, ledger explorer, active quotes). _(Touches `router-server.ts` only for the one compose line — flag for Navid.)_

**Current demo beat:** ranked agents → router-settled pay shim (gap in red if settled > quoted) → validate (verdict + reputation delta) → re-run reroutes off the caught agent.

**Target demo beat:** ranked agents → active quote pinned → agent x402 challenge asks more → payment settles for challenge → automatic validation drops reputation → re-run reroutes off the caught agent. Pitch script/deck/storyboard in `docs/pitch/`.

**Agent registration surface (NEW — registers agents on the deployed Identity registry):**
```
POST /api/agents/register { name, agent_uri, address }
     → { agent_id, registry_agent_id?, tx_id, app_id, owner, agent_uri, explorer, on_chain }
GET  /api/agents → { network, app_id, agents:[{ agent_id, registry_agent_id?, agent_uri, agent_wallet, services }] }
```
Server: `routes.agents.ts` + `identity-onchain.ts` (`registerAgent` for manual POST, `npm run register:testnet-agents` for Honest/Cheat batch). On boot, no on-chain registration runs; known-agent evidence is mapped from `docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json` into `agent_id → registry_agent_id`. Mounted via `app.route('/', makeAgentRoutes(ctx))`. Uses Reza's `register(string,(string,byte[])[])→uint64` ABI (verified against the generated client). Env vars: `.env.demo` + optional `.env`. Spec: `docs/specs/TESTNET_AGENT_REGISTRATION_SPEC_2026-06-06.md`. _(No-impersonation reconciled with Pera: `setCaller` honors a real connected wallet, else pins to the fixed operator wallet.)_
