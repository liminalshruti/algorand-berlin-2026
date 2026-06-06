# Integration Handoff — x402 Trust Router

Live doc. Each engineer updates their section when they land code.
Everyone's Claude should read this before writing anything.

## Current state (origin/main) — all four lanes landed ✅

- **Endpoints live on `:3001`:** `POST /api/route`, `POST /api/pay`, `POST /api/validate`, `GET /api/reputation`, `GET /api/ledger`, `GET /api/providers`.
- **On-chain:** ARC-8004 Identity + Reputation + Validation registries (Algorand TS) with deploy configs, unit specs, and `localnet-e2e.ts`.
- **Frontend:** 5 pages + a left sidebar (Trust Router · Marketplace · Agent Studio · Contracts · Admin) under `public/`.
- **Open follow-ups:** on-chain `giveFeedback` still omits the mandatory x402 `paymentTxid`/`nonce` (ARC-8004 §x402 Profile); `sandbox/lib/router/ranking.ts` is an unused stub (ranking lives in `providers.ts::discoveryOptions`). _(The TEMP `/api/route` stub was removed in d9c303c.)_

---

## Shared context

- Server runs on `:3001` — `npm start` from project root. **Defaults to TestNet** (shared throwaway payer in `context.ts`); set `ALGO_NETWORK=localnet` + `PAYER_MNEMONIC` in `.env` for LocalNet.
- All types live in `sandbox/lib/router/contract.ts` — import from there, never edit it
- Shared state lives in `ctx` (built by `context.ts`) — use the Maps, don't create your own stores
- Wire your routes into your stub file, not into `router-server.ts`

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
POST /api/pay       { route_id, option_id } → { payment_id, txids, quoted_amount, settled_amount, read }
GET  /api/ledger    → { anchors: [{ txid, schema, ref_id, hash, round, network }] }
```

**Verified behaviour:**

- Honest provider: `settled == quoted`, 1 txid confirmed on-chain
- Cheat provider: `settled > quoted` (0.04 quoted → 0.06 settled, +50% hidden fee), 2 txids confirmed
- Ledger: both payments anchored hash-only with real round numbers

**To run (TestNet — default, zero setup):**

```bash
# One-time: fund the shared payer (hardcoded in context.ts) via the dispenser:
#   24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI
# e.g.  algokit dispenser fund -r 24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI -a 10000000
npm start                # boots on TestNet, funds the 3 providers, prints option_ids
```

- **Default network is TestNet.** `context.ts` hardcodes a shared throwaway payer mnemonic so anyone can `npm start` with no `.env` and get real on-chain txids. TestNet ALGO is valueless; the key is public on purpose — never reuse on MainNet.
- Boot calls `fundProviders` (0.5 ALGO each, ~1.5 ALGO/restart), so **the payer must be funded first or boot fails.** Dispense ~10 ALGO; top up if it runs dry.
- Explorer links resolve to `lora.algokit.io/testnet/transaction/<txid>`.
- LocalNet still works: set `ALGO_NETWORK=localnet`, `ALGOD_URL=http://localhost`, `ALGOD_PORT=4001`, `ALGOD_TOKEN`, and a funded `PAYER_MNEMONIC` in a `.env`.

**To run (LocalNet):**

```bash
algokit localnet start   # Docker must be running
npm start                # funds providers automatically, prints option_ids on boot
```

**3 demo providers seeded at startup** (addresses change each restart unless PROVIDER\_\*\_MNEMONIC set in .env):

- 🟢 Honest Agent — 0.1 ALGO, honest
- 🟢 Budget Agent — 0.07 ALGO, honest
- 🔴 Cheat Agent — 0.04 ALGO quoted, 0.06 settled (hidden fee)
- Live `route → pay` confirmed: `route_id` from Reza's `/api/route` resolves in `/api/pay` (bogus id → 400, real id → settle). _(The old TEMP `/api/route` stub was removed in d9c303c.)_

---

## Reza — Identity Registry + Discovery + Ranking ✅ DONE

`POST /api/route` + `GET /api/providers` live (`routes.providers.ts` + `providers.ts`, with
`providers.test.ts`); discovery + ranking in `providers.ts::discoveryOptions` (`ranking.ts` is an
unused stub). On-chain Identity registry below.

**Chain identity registry:**

- `smart_contracts/identity_registry/contract.algo.ts` → `IdentityRegistry`
- Canonical identity: `{ agentRegistry: algorand:{genesisHashPrefix}:{identityAppId}, agentId:uint64 }`
- `register(agentURI, metadata)` → `agentId`; owner=`Txn.sender`; `agentWallet=Txn.sender`
- ARC-72 reads/writes: `arc72_ownerOf`, `arc72_transferFrom`, `arc72_tokenURI`, `arc72_approve`, `arc72_setApprovalForAll`, `arc72_getApproved`, `arc72_isApprovedForAll`, `arc72_balanceOf`, `arc72_totalSupply`, `arc72_tokenByIndex`
- ERC-8004 reads/writes: `getAgentURI`, `setAgentURI`, `getMetadata`, `setMetadata`, `getAgentWallet`, `setAgentWallet`, `unsetAgentWallet`
- ARC-73: `supportsInterface` for ARC-73 + ARC-72 core/metadata/transfer/enumeration
- Deploy: `smart_contracts/identity_registry/deploy-config.ts`; client/artifacts in `smart_contracts/artifacts/identity_registry/`
- Deploy path: `npm run build && npm run deploy:localnet` includes `identity_registry`
- Router identity remains compatibility alias: `providerId(net,address)` → `algorand:{net}:{address}`

**Live endpoints:**

```
GET  /api/providers?register=Diligence → { register, providers:[{ provider_id, agent_uri, address, quote, asset }] }
POST /api/route { task, register } → { route_id, task, register, options:[RouteOption] }
```

**What teammates can consume:**

- `providerId(net,address)` → `algorand:{net}:{address}`
- `registerProvider(ctx,input)` stores `Provider.agent_uri` in `ctx.providers`
- `discover(ctx.providers.values(), register)` returns identity matches
- `/api/route` is discovery-compatible only; no `ctx.repState` ranking yet
- `/api/route` stores:

```ts
ctx.routeStore.set(route_id, {
  route_id,
  task,
  options: RouteOption[],  // see contract.ts for the shape
});
```

- `/api/pay` looks up `route_id` from `ctx.routeStore` — if it's not there, pay returns 400

**Where to write your code:**

- Routes → `sandbox/lib/router/routes.providers.ts` → inside `makeProviderRoutes(ctx)`
- Logic → `sandbox/lib/router/providers.ts`

---

## Shayaun — Reputation Registry + Validation Registry ✅ ROUTER GLUE WIRED

- Live: `POST /api/validate {payment_id}` → `{validation_id, price_match, output_pass, response, new_reputation, verdict_txid}`; `GET /api/reputation?provider=` → `{provider_id, score, reads_logged, corrections_logged, by_tag, uri, hash}`.
- `makeValidationRoutes(ctx)` **injects `ctx.repState`** (in-memory; score = (landed−corrected)/landed) so `/api/route` reroutes after a write-back — no `router-server.ts` change needed.
- Verdict anchored hash-only via `ctx.deps.anchorNote` (real txid on LocalNet; skipped if algod down).
- On-chain registries deploy via new `smart_contracts/{reputation,validation}_registry/deploy-config.ts` (`npm run deploy`).
- **On-chain write wired (env-gated):** `onchain.ts::maybeWriteReputation` calls `giveFeedback` on the deployed Reputation registry from `/api/validate` (best-effort; returns the txid in `on_chain_feedback_txid` + a `erc8004.giveFeedback` ledger entry). Enable with `REPUTATION_APP_ID` + `REPUTATION_SUBMITTER_MNEMONIC` (or `PAYER_MNEMONIC`). No-op/safe when unset.
- ⚠️ TODO (yours): add mandatory x402 `paymentTxid`+`nonce` to the on-chain `giveFeedback` (ARC-8004 §x402 Profile) — recompile, then pass them through `onchain.ts`. Confirm the generated client method/arg names match `onchain.ts`.

**What's ready for you to consume:**

- `ctx.paymentStore.get(payment_id)` → `{ payment_id, provider_id, quoted, settled, txids, read }` — use `quoted` vs `settled` to determine if the provider cheated
- `ctx.deps.anchorNote(ref_id, schema, hash)` — anchor your verdict hash-only on-chain

**What Navid needs from you:**

- Pass your `repState` into `buildContext(repState)` in `router-server.ts` when you're ready:

```ts
import { createRepState } from "../lib/router/reputation-state";
const repState = createRepState();
const ctx = await buildContext(repState);
```

- Reza's ranking reads `ctx.repState.getReputation(provider_id)` — make sure `createRepState()` implements that

**Where to write your code:**

- Routes → `sandbox/lib/router/routes.validation.ts` → inside `makeValidationRoutes(ctx)`
- Logic → `sandbox/lib/router/validation.ts` and `sandbox/lib/router/reputation-state.ts`

**When you're done, update this section with your live endpoints.**

---

## Shruti — UI + Narrative ✅ MULTI-PAGE CONSOLE + SIDEBAR

- **5 pages behind a left in-frame sidebar** (`public/nav.js` + `nav.css`): **Trust Router** (`router.html`), **Marketplace** (`marketplace.html`), **Agent Studio** (`studio.html`), **Contracts** (`contracts.html`), **Admin** (`admin.html`). One engine: `registry.js` + `arc8004.js` drive each page by `body[data-view]`; `router.{html,js,css}` is the trust-router flow.
- **Live wiring:** `router.js` top — `const LIVE = { route, pay, validate, reputation, ledger }` (all true), `BASE_URL='http://localhost:3001'`, graceful per-endpoint mock fallback + server health probe. The ARC-8004 console (`arc8004.js`) is mock-first (no backend endpoints for the raw registries yet).
- Open via a static server (not `file://`, so vendored CSS/fonts + clipboard work). CORS is handled by the router-server.
- Provider identity + before-score sourced from the picked RouteOption (never from pay/validate).

**All endpoints consumed (live):** `POST /api/route`, `POST /api/pay`, `POST /api/validate`, `GET /api/reputation`, `GET /api/ledger`, `GET /api/providers`.

**The demo beat:** ranked providers → pay (gap in red if settled > quoted) → validate (verdict + reputation delta) → re-run reroutes off the caught provider. Pitch script/deck/storyboard in `pitch/`.
