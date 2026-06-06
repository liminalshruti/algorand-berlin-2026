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

**3 demo providers seeded at startup** (addresses change each restart unless PROVIDER_*_MNEMONIC set in .env):
- 🟢 Honest Agent — 0.1 ALGO, honest
- 🟢 Budget Agent — 0.07 ALGO, honest
- 🔴 Cheat Agent  — 0.04 ALGO quoted, 0.06 settled (hidden fee)

---

## Reza — Identity Registry + Discovery + Ranking

**What's ready for you to consume:**
- `ctx.repState.getReputation(provider_id)` → `{ score, reads_logged, corrections_logged } | null` — Shayaun writes this, read it for ranking

**What Navid needs from you:**
- When `/api/route` runs, store your result in `ctx.routeStore` like this:
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
- Logic → `sandbox/lib/router/providers.ts` and `sandbox/lib/router/ranking.ts`

**When you're done, update this section with your live endpoint.**

---

## Shayaun — Reputation Registry + Validation Registry

**What's ready for you to consume:**
- `ctx.paymentStore.get(payment_id)` → `{ payment_id, provider_id, quoted, settled, txids, read }` — use `quoted` vs `settled` to determine if the provider cheated
- `ctx.deps.anchorNote(ref_id, schema, hash)` — anchor your verdict hash-only on-chain

**What Navid needs from you:**
- Pass your `repState` into `buildContext(repState)` in `router-server.ts` when you're ready:
```ts
import { createRepState } from '../lib/router/reputation-state';
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
const BASE_URL = 'http://localhost:3001';
```
