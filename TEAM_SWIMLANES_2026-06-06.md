# Team swimlanes — x402 trust router (4 engineers, 4h code-complete)

**Date:** 2026-06-06 (hack day 1) · **Spine:** `liminal-agents-v1/sandbox/bin/berlin-server.js`
**Goal:** code-complete in 4h with zero merge conflicts — every commit atomic, every lane independently QA'd before PR.
**Companion docs:** `END_TO_END_HACK_SCOPE_2026-06-06.md` (scope + dataflow), `ERC8004_SPEC` mapping below.

---

## Conflict model (read first)

- **The hot file is `sandbox/bin/berlin-server.js`** — if everyone adds routes there, you get four-way conflicts.
- **Rule: nobody edits `berlin-server.js` or any existing `lib/x402/*` file.** All new work lands in `sandbox/lib/router/`, `sandbox/public/`, and one new `sandbox/bin/router-server.js` that *imports* berlin's routes and merges yours.
- **Each engineer owns a disjoint file set** → atomic, conflict-free commits in any merge order.
- **One shared file, `lib/router/contract.js`, frozen at H0** (Navid writes it once; everyone else read-only).
- Route handlers are composed via `make…Routes(ctx)` factories — the route table is assembled, never co-edited.

## Seating + file ownership

| Engineer | Lane | Owns (disjoint files) |
|---|---|---|
| **Shruti** | UI + Narrative | `public/router.html`, `public/router.js`, `public/router.css` + demo video, pitch deck, pitch script |
| **Shayaun** | Reputation Registry + Validation Registry | `lib/router/validation.js`, `lib/router/reputation-state.js`, `lib/router/routes.validation.js` |
| **Navid** | Payment + Integration harness *(integration owner)* | `bin/router-server.js`, `lib/router/pay.js`, `lib/router/context.js`, `lib/router/contract.js` *(H0 only)* |
| **Reza** | Identity Registry + Discovery *(ranking follow-up)* | `lib/router/providers.js`, `lib/router/ranking.js`, `lib/router/routes.providers.js` |

## ERC-8004 → Algorand mapping (basis for the specs)

Reference: `erc-8004/erc-8004-contracts` (3 upgradeable contracts) + `ChaosChain/trustless-agents-erc-ri` (security guards).

| ERC-8004 RI (Ethereum, Solidity) | Our Algorand-native equivalent | Owner |
|---|---|---|
| **Identity** — ERC-721 `register(agentURI,meta)→agentId`; id `{ns}:{chainId}:{registry}:{agentId}` | Provider = Algorand **address** (no NFT); `register(address, agent_uri)`; id `algorand:{net}:{address}` | Reza |
| **Reputation** — `giveFeedback(agentId, value:int128, valueDecimals, …, feedbackURI, feedbackHash)`, `getSummary`; self-feedback prevented | feedback `{provider, response:0–100, uri, hash}` anchored hash-only; `score=(landed−corrected)/landed`; submitter≠provider | Shayaun |
| **Validation** — `validationRequest/Response(response:uint8 0–100, responseHash)`; self-validation prevented | `validate(payment)→{response:0–100, verdict_hash}` = price-vs-quote + output; validator≠provider | Shayaun |
| *(payment — out of ERC-8004 scope)* | x402 settle on Algorand = the on-chain evidence; ranking = our trust aggregate | Navid / Reza |

---

## Responsibilities

### Shruti — UI + Narrative (the visible layer + the story)
- **Mission:** build the visible interaction layer **over everyone else's work** — turn the four backend lanes into one legible experience — and own the narrative: demo video, pitch deck, pitch script.
- **Builds (UI):** four views surfacing each teammate's module — Reza's ranked providers, Navid's payment/txids + ledger, Shayaun's verdict + reputation delta — and the loop: request → rank → pay → validate → **re-run that reroutes away from the cheater**.
- **Builds (narrative):** demo video, pitch deck, pitch script — the submission artifacts judges see.
- **Accountable for:** the demo reads clearly end-to-end (especially the "caught cheating → reputation drops → reroute" beat); the deck + script frame the value prop and honesty seam (ERC-8004-shaped, Algorand-native, mock+live).
- **Consumes:** the frozen API from all three backend lanes (builds mock-first, flips to live). Depends on everyone; blocks no one. Natural person to flag integration gaps.
- **Timing:** UI by code-complete (midnight); video/deck/script run as the pitch track into pitch-prep morning.

### Shayaun — Reputation Registry + Validation Registry (trust loop)
- **Mission:** make reputation *earned* — turn an on-chain payment into a verdict, and a verdict into a reputation that changes the next route.
- **Builds:** `validate(payment, provider)` (price-vs-quote + output → `response` 0–100), `giveFeedback`/`writeBack`/`getReputation`, and the `/api/validate` + `/api/reputation` routes.
- **Accountable for:** a hidden-fee payment yields `response=0`, drops the provider's score, anchors it hash-only; self-feedback and self-validation guards hold.
- **Consumes:** `ctx.paymentStore` (from Navid). **Produces:** `ctx.repState.getReputation(id)` (read by Reza). Touches chain only via `anchorNote`.

### Navid — Payment + Integration harness *(integration owner)*
- **Mission:** the chain spine + the glue that merges four people's modules into one server.
- **Builds:** `payProvider` (honest = settle quote; dishonest = quote + a real second hidden-fee settlement), `buildContext`, the `/api/pay` + `/api/ledger` routes, and `router-server.js` merging everyone's `make…Routes(ctx)`.
- **Accountable for:** server boots on LocalNet; `/api/pay` returns real txids; `berlin-server.js` untouched; **owns `contract.js`, frozen at H0**.
- **Consumes:** Reza's `routeStore`. **Produces:** `ctx.paymentStore` (read by Shayaun). Pairs with anyone during H3–H4 wiring.

### Reza — Identity Registry + Discovery
- **Mission:** give providers an ERC-8004-shaped Algorand identity and expose discovery so downstream payment/ranking can consume stable provider IDs.
- **Builds:** `providerId`/`registerProvider`/`discover` (3 seeded Diligence providers), `GET /api/providers`, and discovery-compatible `POST /api/route`.
- **Accountable for:** `providerId` = `algorand:{net}:{address}`; `agent_uri` is preserved; `discover('Diligence')` returns only Diligence; `/api/route` stores options in `ctx.routeStore` without reputation ranking.
- **Consumes:** `ctx.providers`. **Produces:** `ctx.routeStore` (read by Navid).

---

## The frozen contract (Navid commits at H0; read-only after)

```js
// lib/router/contract.js  — types-as-comments + shared constants.
// Provider:     { id(addr), name, register, quote, asset, quality:0..1, dishonest:bool, agent_uri }
// RouteOption:  { option_id, provider_id, name, price, reputation, validation_rate, trust_score, weight }
// PaymentResult:{ payment_id, provider_id, quoted, settled, txids:[], read }
// Verdict:      { validation_id, price_match:bool, output_pass:bool|null, response:0..100, verdict_txid }
// ctx:          { net, store, session:{payer,facilitator,funded}, providers,
//                 routeStore:Map, paymentStore:Map, repState, ledger:[],
//                 deps:{ anchorNote, buildReputationEntry, anchorReputationEntry, explorerFor } }
export const TRUST_WEIGHTS = { price: 0.3, reputation: 0.4, validation: 0.3 };
export const ROUTER_ROUTES = ["POST /api/route","POST /api/pay","POST /api/validate","GET /api/reputation","GET /api/ledger"];
// GET routes use query params (e.g. /api/reputation?provider=…) so the exact-match router needs no change.
```

## Frozen API (everyone codes to this)

```
POST /api/route     { task, register } → { route_id, options:[{option_id,provider_id,name,price,reputation,validation_rate,trust_score,weight}] }
POST /api/pay       { route_id, option_id } → { payment_id, settle_txid|txids, quoted_amount, settled_amount, read }
POST /api/validate  { payment_id } → { validation_id, price_match, output_pass, response:0..100, new_reputation, verdict_txid }
GET  /api/reputation?provider=…   → { provider_id, score, reads_logged, corrections_logged, by_tag, uri, hash }
GET  /api/ledger    → { anchors:[{txid,schema,ref_id,hash,round,network}] }
```

---

## Definition of Done + QA per lane (run before opening a PR)

**Universal gate (everyone):** `git diff --name-only` ⊆ your owned files · imports only from `contract.js` + existing `lib/x402/*` (read-only) + your files · your own `*.test.js` green via `node --test` · `node bin/router-server.js` boots clean after merge.

**Shruti (UI):** renders with backend OFF (mock) · ranked table shows price/rep/trust/weight, pick highlighted · settle view shows txid (explorer link) + quoted-vs-settled, **gap in red** on hidden fee · validation view shows verdict + rep delta · **re-run visibly reroutes** · ledger lists anchored txids · no console errors · mock→live via one base-URL const.

**Shayaun (Reputation + Validation):** hidden fee → `response=0` · `response` ∈ [0,100] · self-feedback rejected (client≠provider) · self-validation rejected (validator≠provider) · unknown provider → `null` not `0` · score **strictly decreases** after a fail · anchored note = `{schema,provider,score,hash}` only · `by_tag` uses the 9-tag taxonomy.

**Navid (Payment + Integration):** honest → `settled==quoted`, 1 txid · dishonest → `settled>quoted`, 2 txids confirmed · unknown route/option → 400, no settlement · replay rejected · ledger entry has `{txid,schema,hash,round}` only · `git diff berlin-server.js` empty · `contract.js` unchanged since H0.

**Reza (Identity + Discovery):** `providerId` = `algorand:{net}:{address}` · `agent_uri` preserved · `discover('Diligence')` returns only Diligence · `GET /api/providers` returns identities · `POST /api/route` stores `route_id` in `ctx.routeStore` · no `ctx.repState` dependency in the identity-only slice.

---

## H0 ritual + branch protocol

1. **H0 (~20 min, together):** Navid lands `contract.js` + `router-server.js` skeleton + empty stubs for every module on `main`; everyone pulls (green imports).
2. Each engineer on `feat/router-<name>`, edits **only** owned files; **merge to `main` early and often** — disjoint files = conflict-free in any order.
3. Hard rules: never touch `berlin-server.js`; never edit `contract.js` after H0 (need a change → Navid amends once, all pull).
4. Each engineer adds their **own** `*.test.js` (disjoint).
5. **Integration order H3–H4:** `route` (Reza) → `pay` (Navid) → `validate`+`writeBack` (Shayaun) → UI reroute (Shruti).

## Dependency chain

`Reza discovers → Navid pays → Shayaun validates + scores → Shruti surfaces it → ranking reroutes away from the cheater`

Everyone builds against **mocks** for what they consume, so no lane blocks another. Shruti's UI is the only lane consuming all of them — mock-first is what lets her start immediately.
