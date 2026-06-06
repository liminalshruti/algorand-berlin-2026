# Integration Handoff — x402 Trust Router

Live doc. Each engineer updates their section when they land code.
Everyone's Claude should read this before writing anything.

---

## Shared context

- Server runs on `:3001` — `npm start` from project root
- All types live in `sandbox/lib/router/contract.ts` — import from there, never edit it
- Shared state lives in `ctx` (built by `context.ts`) — use the Maps, don't create your own stores
- Wire your routes into your stub file, not into `router-server.ts`

---

## Navid — Payment + Integration ✅ DONE + VERIFIED ON LOCALNET

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

**To run:**

```bash
algokit localnet start   # Docker must be running
npm start                # funds providers automatically, prints option_ids on boot
```

**3 demo providers seeded at startup** (addresses change each restart unless PROVIDER\_\*\_MNEMONIC set in .env):

- 🟢 Honest Agent — 0.1 ALGO, honest
- 🟢 Budget Agent — 0.07 ALGO, honest
- 🔴 Cheat Agent — 0.04 ALGO quoted, 0.06 settled (hidden fee)
  **TEMP stub for Reza (delete when `makeProviderRoutes` serves `/api/route`):**
- `router-server.ts` serves `POST /api/route { task, register } → { route_id, options[], excluded[] }` — ranks seeded providers via frozen `TRUST_WEIGHTS`, writes `ctx.routeStore`, reads `ctx.repState.getReputation` (reroute-ready). Registered _after_ `makeProviderRoutes(ctx)`, so Reza's real handler overrides it on arrival.
- Unblocks live `route → pay`: the `route_id` now resolves in `/api/pay` (verified — bogus id → 400, real id → settle). Live settlement still needs LocalNet up.

---

## Reza — Identity Registry + Discovery + Ranking

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
- ⚠️ TODO (yours): `giveFeedback` needs mandatory x402 `paymentTxid`+`nonce` (ARC-8004 §x402 Profile) — recompile; then mirror the in-memory write to the on-chain client (seam noted in `routes.validation.ts`).

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

## Shruti — UI + Narrative ✅ UI BUILT · LIVE MODE ON

- UI lives in `public/router.{html,js,css}` (vendored design system; open via a static server, not file://).
- `public/router.js` top: `const LIVE = { route, pay, validate, reputation, ledger }` — per-endpoint mock↔live switch; `BASE_URL='http://localhost:3001'`. Currently **all true** (live). Flip any to `false` to mock that endpoint.
- Needs from backend: live `/api/route` (mine sends its `route_id` to `/api/pay`); CORS allow-origin on the router-server if the page isn't served from `:3001`.
- Failures surface as a red toast; provider identity + before-score are sourced from the picked RouteOption (never from pay/validate).

**Live endpoints right now:**

```
POST /api/pay       { route_id, option_id } → { payment_id, txids, quoted_amount, settled_amount, read }
GET  /api/ledger    → { anchors: [{ txid, schema, ref_id, hash, round, network }] }
```

**Mock these until teammates land theirs:**

```
POST /api/route     { task, register } → { route_id, options: [{ option_id, provider_id, name, price, reputation, validation_rate, trust_score, weight }] }
POST /api/validate  { payment_id } → { validation_id, price_match, output_pass, response, new_reputation, verdict_txid }
GET  /api/reputation?provider=…  → { provider_id, score, reads_logged, corrections_logged, by_tag, uri, hash }
```

**The demo beat to surface:**

1. Ranked providers table — price, reputation, trust score, weight
2. Pay → show txid(s) + quoted vs settled — **gap in red if settled > quoted**
3. Validate → show verdict + reputation delta
4. Re-run → table updates, cheating provider drops or disappears

**Base URL constant** — one place to flip mock → live:

```ts
const BASE_URL = "http://localhost:3001";
```
