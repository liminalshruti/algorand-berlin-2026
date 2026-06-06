# x402 Trust Router — build overview + shared contract

**Hack:** Algorand Builders Berlin (x402) · **Track:** Infrastructure · **Date:** 2026-06-06
**Goal:** code-complete in ~4h, zero merge conflicts, each lane independently QA'd before PR.

Per-person implementation specs:
- `SPEC_navid_payment_integration.md`
- `SPEC_reza_identity_discovery_ranking.md`
- `SPEC_shayaun_reputation_validation.md`
- `SPEC_shruti_ui_narrative.md`

## What we're building (one sentence)

A **trust router** over x402 on Algorand: an operator asks for a service; we collect competing
providers' on-chain price quotes, rank them by **price + earned reputation + validation**, pay the
winner, then **validate the delivery against its quote on-chain** — so a provider that quotes low and
charges high (or under-delivers) is caught by the chain and loses the next route. Reputation is
*earned*, not self-reported.

## Why (value prop — don't lose it)

Existing marketplaces rank on price + **self-reported** reputation, which is gameable (cheapest in the
ranking, then hidden fees at checkout). The missing infrastructure is **validated reputation**: trust
the chain enforces. *"ERC-8004 gives agents a passport; we give the marketplace a conscience."*

## ERC-8004 → Algorand mapping (the basis for the specs)

Reference: `erc-8004/erc-8004-contracts` + `ChaosChain/trustless-agents-erc-ri`. ERC-8004 is an
Ethereum standard; **not deployed on Algorand** — ours are ERC-8004-*shaped*, Algorand-native.

| ERC-8004 registry (Solidity RI) | Our Algorand-native equivalent | Owner |
|---|---|---|
| **Identity** — ERC-721 `register(agentURI,meta)→agentId`; id `{ns}:{chainId}:{registry}:{agentId}` | Provider = Algorand **address** (no NFT); `register(address, card_uri, card_hash)`; id `algorand:{net}:{address}` | Reza |
| **Reputation** — `giveFeedback(agentId, value:int128, valueDecimals, …, feedbackURI, feedbackHash)`, `getSummary`; self-feedback prevented | feedback `{provider, response:0–100, uri, hash}` anchored hash-only; `score=(landed−corrected)/landed`; submitter≠provider | Shayaun |
| **Validation** — `validationRequest/Response(response:uint8 0–100, responseHash)`; self-validation prevented | `validate(payment)→{response:0–100, verdict_hash}` = price-vs-quote + output; validator≠provider | Shayaun |
| *(payment — out of ERC-8004 scope)* | x402 settle on Algorand = the on-chain evidence; ranking = our trust aggregate | Navid / Reza |

## Seating + file ownership (disjoint — atomic, conflict-free commits)

| Engineer | Lane | Owns (new files only) |
|---|---|---|
| **Shruti** | UI + Narrative | `public/router.html`, `public/router.js`, `public/router.css` + demo video, pitch deck, pitch script |
| **Shayaun** | Reputation + Validation registries | `lib/router/validation.js`, `lib/router/reputation-state.js`, `lib/router/routes.validation.js` |
| **Navid** | Payment + Integration harness *(integration owner)* | `bin/router-server.js`, `lib/router/pay.js`, `lib/router/context.js`, `lib/router/contract.js` *(H0)* |
| **Reza** | Identity + Discovery + Ranking | `lib/router/providers.js`, `lib/router/ranking.js`, `lib/router/routes.providers.js` |

## Conflict model

- Nobody edits the existing x402 server file or existing `lib/x402/*`. All new work in `lib/router/`,
  `public/`, and one new `bin/router-server.js` that imports the base routes and merges yours.
- Route handlers are composed via `make…Routes(ctx)` factories — the route table is assembled, never
  co-edited.
- One shared file `lib/router/contract.js`, frozen at H0 (Navid writes once; everyone else read-only).

## Frozen contract (`lib/router/contract.js`)

```js
// types-as-comments + shared constants. READ-ONLY after H0.
// Provider:      { id(addr), name, register, quote, asset, quality:0..1, dishonest:bool, card_uri, card_hash }
// RouteOption:   { option_id, provider_id, name, price, reputation, validation_rate, trust_score, weight }
// PaymentResult: { payment_id, provider_id, quoted, settled, txids:[], read }
// Verdict:       { validation_id, price_match:bool, output_pass:bool|null, response:0..100, verdict_txid }
// ctx:           { net, store, session:{payer,facilitator,funded}, providers,
//                  routeStore:Map, paymentStore:Map, repState, ledger:[],
//                  deps:{ anchorNote, buildReputationEntry, anchorReputationEntry, explorerFor } }
export const TRUST_WEIGHTS = { price: 0.3, reputation: 0.4, validation: 0.3 };
export const ROUTER_ROUTES = ["POST /api/route","POST /api/pay","POST /api/validate","GET /api/reputation","GET /api/ledger"];
// GET routes use query params (e.g. /api/reputation?provider=…) so the exact-match router needs no change.
```

## Frozen API (everyone codes to this)

```
POST /api/route     { task, register } → { route_id, options:[RouteOption] }
POST /api/pay       { route_id, option_id } → { payment_id, txids, quoted_amount, settled_amount, read }
POST /api/validate  { payment_id } → { validation_id, price_match, output_pass, response:0..100, new_reputation, verdict_txid }
GET  /api/reputation?provider=…  → { provider_id, score, reads_logged, corrections_logged, by_tag, uri, hash }
GET  /api/ledger    → { anchors:[{txid,schema,ref_id,hash,round,network}] }
```

## Dependency chain

`Reza ranks → Navid pays → Shayaun validates + scores → Shruti surfaces it → re-run, Reza re-ranks (cheater drops)`

Everyone builds against **mocks** for what they consume, so no lane blocks another.

## H0 ritual + branch protocol

1. **H0 (~20 min, together):** Navid lands `contract.js` + `router-server.js` skeleton + empty stubs on `main`; everyone pulls (green imports).
2. Each engineer on `feat/router-<name>`, edits only owned files; **merge to `main` early and often** — disjoint files = conflict-free in any order.
3. Hard rules: never touch the base x402 server; never edit `contract.js` after H0.
4. Each engineer adds their own `*.test.js` (disjoint).
5. **Integration order H3–H4:** `route` (Reza) → `pay` (Navid) → `validate`+`writeBack` (Shayaun) → UI reroute (Shruti).

## Universal PR-ready gate (every engineer)

- `git diff --name-only` ⊆ your owned files.
- Imports only from `contract.js`, existing `lib/x402/*` (read-only), and your own files.
- Your own `*.test.js` passes via `node --test`.
- `node bin/router-server.js` boots clean after your merge.
