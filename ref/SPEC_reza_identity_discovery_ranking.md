# SPEC — Reza · Identity Registry + Discovery + Ranking

**Lane:** mirrors ERC-8004 **Identity Registry**. Ranking is a follow-up layer over this identity surface.
**Owns:** `lib/router/providers.js`, `lib/router/ranking.js`, `lib/router/routes.providers.js`

## Abstract

Discover the providers that can serve a task and give each a portable Algorand-native identity. The
identity-only route surface returns discovery-compatible options so payment/UI can integrate before
earned reputation ranking is wired.

## Motivation

Routing needs a candidate set before it can rank. This layer provides the ERC-8004-shaped identity
handle and agent registration file URI; reputation, validation, and weighted ranking sit above it.

## Specification

### `lib/router/providers.js` (Identity Registry, Algorand-native)
```js
providerId(net,address) → `algorand:${net}:${address}`
registerProvider(ctx,{ name, register, quote, asset, quality, dishonest, agent_uri }) → Provider
discover(providers,register) → Provider[]
```
- Seed **3 mock providers**: `honest` (quality≈0.9, dishonest=false), `hidden_fee`
  (cheapest quote, dishonest=true), `low_quality` (quality≈0.3).
- Live adapter behind `LIVE_PROVIDERS=true` (query an external x402 marketplace) — fully isolated,
  no-op when the flag is off. Never on the critical path.
- Identity = Algorand **address** + a registry entry pointing to `agent_uri` (no NFT).
- `agent_uri` is the ERC-8004 agent registration file URI analog. No identity hash is stored in this
  scope; hashes remain in payment/reputation/validation anchoring.

### `lib/router/ranking.js` (pure — no chain/server imports)
```js
collectQuotes(providers) → options with price
trustScore(price, reputation, validation_rate, weights=TRUST_WEIGHTS) → 0..1
  // priceScore = 1 - (price - min)/(max - min); weighted sum with reputation & validation_rate
rankOptions(providers, repLookup) → RouteOption[]   // follow-up scope
weightedPick(options, seed=route_id) → option        // deterministic — NO Math.random
```

### `lib/router/routes.providers.js`
```js
makeProviderRoutes(ctx) → { "GET /api/providers", "POST /api/route" }
// GET /api/providers: discover → return provider_id + agent_uri identities
// POST /api/route: discover → compatibility RouteOption[] → ctx.routeStore[route_id]
```

## Rationale

Identity = address + agent registration file URI (ERC-8004 Identity construct, Algorand-native). The
aggregate `f(price, reputation, validation)` is the anti-race-to-bottom follow-up layer; this slice
deliberately does not call `ctx.repState`.

## Security / Risk Considerations

- Live marketplace calls may need auth/timeout → wrap in try/catch, fall back to mock silently.
- `POST /api/route` returns neutral deterministic compatibility fields, not reputation-ranked scores.
- Identity is headless and unit-testable; keep all chain/IO out of the discovery helpers.

## Definition of Done

- `GET /api/providers?register=Diligence` returns provider identities with `agent_uri`.
- `POST /api/route` stores discovery-compatible options in `ctx.routeStore`.
- 3 seeded providers; live adapter remains out of the critical path.

## QA — success criteria (run before PR)

- [ ] `agent_uri` is preserved; no identity hash is required.
- [ ] `providerId` format = `algorand:{net}:{address}`.
- [ ] `discover('Diligence')` returns only Diligence providers.
- [ ] `POST /api/route` stores `route_id` in `ctx.routeStore` for `/api/pay`.
- [ ] identity tests run with **no network** and no `lib/x402` import.

## Dependencies

- **Consumes:** `ctx.providers`.
- **Produces:** `ctx.routeStore` (read by Navid's pay).
