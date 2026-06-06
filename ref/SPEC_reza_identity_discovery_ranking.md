# SPEC — Reza · Identity Registry + Discovery + Ranking

**Lane:** mirrors ERC-8004 **Identity Registry** + adds the trust-aggregate ranking.
**Owns:** `lib/router/providers.js`, `lib/router/ranking.js`, `lib/router/routes.providers.js`

## Abstract

Discover the providers that can serve a task, give each a portable Algorand-native identity, and rank
them by an aggregate of **price + earned reputation + validation** so cheap-but-dishonest cannot win.

## Motivation

Routing needs a candidate set + a defensible ordering. Pure price ranking is gameable (race to the
bottom); the aggregate ranking is the mechanism that makes the marketplace trustworthy.

## Specification

### `lib/router/providers.js` (Identity Registry, Algorand-native)
```js
registerProvider({ name, register, address, quote, asset, quality, dishonest, card_uri, card_hash })
discover(register) → Provider[]
providerId(p) → `algorand:${net}:${p.address}`   // mirrors ERC-8004 {ns}:{chainId}:{registry}:{agentId}
```
- Seed **3 mock providers**: `honest` (quality≈0.9, dishonest=false), `hidden_fee`
  (cheapest quote, dishonest=true), `low_quality` (quality≈0.3).
- Live adapter behind `LIVE_PROVIDERS=true` (query an external x402 marketplace) — fully isolated,
  no-op when the flag is off. Never on the critical path.
- Identity = Algorand **address** + a registry entry pointing to `card_uri` + `card_hash` (no NFT).

### `lib/router/ranking.js` (pure — no chain/server imports)
```js
collectQuotes(providers) → options with price
trustScore(price, reputation, validation_rate, weights=TRUST_WEIGHTS) → 0..1
  // priceScore = 1 - (price - min)/(max - min); weighted sum with reputation & validation_rate
rankOptions(providers, repLookup) → RouteOption[]   // sorted desc by trust_score; excludes zero-rep
weightedPick(options, seed=route_id) → option        // deterministic — NO Math.random
```

### `lib/router/routes.providers.js`
```js
makeProviderRoutes(ctx) → { "POST /api/route", "GET /api/providers" }
// /api/route: discover → collectQuotes → read reputation via ctx.repState.getReputation → rank →
//             store in ctx.routeStore[route_id] → return { route_id, options }
```

## Rationale

Identity = address + card (ERC-8004 Identity construct, Algorand-native). The aggregate
`f(price, reputation, validation)` is the anti-race-to-bottom core: a provider with zero/no validated
history is excluded (the bounded-refusal guard); a cheap provider with poor reputation cannot top the
ranking.

## Security / Risk Considerations

- Live marketplace calls may need auth/timeout → wrap in try/catch, fall back to mock silently.
- `weightedPick` must be deterministic (seeded) so the demo is reproducible.
- Ranking is pure → unit-testable offline; keep all chain/IO out of `ranking.js`.

## Definition of Done

- `POST /api/route` returns ranked options with `trust_score` + `weight`, pick highlighted.
- 3 seeded providers; live adapter present but flagged off.

## QA — success criteria (run before PR)

- [ ] zero-reputation / no-history provider is **excluded** from ranking.
- [ ] cheapest-but-low-rep does **not** rank #1 when an honest mid-price provider exists.
- [ ] `trustScore` is pure (same inputs → same output); weights normalized.
- [ ] `weightedPick` is deterministic for a given seed.
- [ ] `providerId` format = `algorand:{net}:{address}`.
- [ ] `discover('Diligence')` returns only Diligence providers.
- [ ] `ranking.test.js` runs with **no network** and no `lib/x402` import.

## Dependencies

- **Consumes:** `ctx.repState.getReputation(id)` (from Shayaun).
- **Produces:** `ctx.routeStore` (read by Navid's pay).
