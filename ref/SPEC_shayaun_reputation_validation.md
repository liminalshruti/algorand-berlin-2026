# SPEC — Shayaun · Reputation Registry + Validation Registry

**Lane:** mirrors ERC-8004 **Reputation Registry** + **Validation Registry** (with ChaosChain RI guards).
**Owns:** `lib/router/validation.js`, `lib/router/reputation-state.js`, `lib/router/routes.validation.js`

## Abstract

Turn an on-chain payment into a verdict (did the provider deliver honestly?), and a verdict into a
reputation that changes the next route. This is the trust loop — the thing that makes reputation
*earned* rather than self-reported.

## Motivation

ERC-8004's registries assume trustworthy inputs but don't produce them. The validation we run
(price-vs-quote + output) is what makes a reputation entry worth reading. Validation → reputation is
one data flow, so it's one lane.

## Specification

### `lib/router/validation.js` (Validation Registry, Algorand-native)
```js
validate(payment, provider) → Verdict
// Verdict = { validation_id, price_match, output_pass, response:0..100, verdict_uri, verdict_hash }
```
- `price_match = payment.settled <= payment.quoted` (objective; both values on-chain).
- `output_pass` from `provider.quality` threshold (or `null` if output check skipped).
- `response` (ERC-8004 0–100 scale): `100` iff `price_match && output_pass`; `0` on price mismatch;
  partial otherwise.
- **self-validation guard:** reject if `validatorAddress == provider.address`.
- Anchor `{schema:"liminal.validation.v1", payment_id, response, hash}` via `ctx.deps.anchorNote`.

### `lib/router/reputation-state.js` (Reputation Registry, Algorand-native)
```js
giveFeedback(ctx, { provider_id, client, response, by_tag, uri })   // self-feedback guard: client≠provider
writeBack(ctx, provider_id, verdict)   // updates counts, recomputes score, anchors
getReputation(provider_id) → { score, reads_logged, corrections_logged, by_tag, uri, hash }  // getSummary analog
```
- `writeBack`: increment `reads_logged`; on a failed verdict increment `corrections_logged` and tag
  it (`by_tag`, 9-tag taxonomy — e.g. `missed_compensation` for a hidden fee); recompute
  `score = round(100 * (landed - corrected) / landed)`; `null` when `landed == 0` (no opinion).
- Anchor via the existing reputation helpers (`buildReputationEntry`/`anchorReputationEntry` from
  `lib/x402/*`) — import, do **not** modify. On-chain note carries only `{schema, provider, score, hash}`;
  full detail stays off-chain at `uri`.

### `lib/router/routes.validation.js`
```js
makeValidationRoutes(ctx) → { "POST /api/validate", "GET /api/reputation" }
// /api/validate: load ctx.paymentStore[payment_id] → validate → writeBack → return verdict + new_reputation
// /api/reputation?provider=…: return getReputation(provider)
```

## Rationale

Reputation = how a provider's quote/quality survives correction (the locked thesis, applied to
providers). Self-feedback and self-validation guards (from the ERC-8004 RI) are what keep the score
honest. Hash-only anchoring keeps detail private while making the score verifiable.

## Security / Risk Considerations

- **Self-feedback prevention** (client ≠ provider) and **self-validation prevention** (validator ≠
  provider) are mandatory — without them a provider games its own score.
- `response` must be clamped to `[0,100]`.
- Output-quality validation is fuzzy → lead with the objective price-vs-quote check for the MVP.

## Definition of Done

- `POST /api/validate` computes the verdict from on-chain settled-vs-quoted; `writeBack` drops a
  dishonest provider's score and anchors it; `GET /api/reputation?provider=` returns the summary.
- Re-running `/api/route` reorders so the caught provider falls.

## QA — success criteria (run before PR)

- [ ] hidden fee → `price_match=false` → `response=0`.
- [ ] `response` always in `[0,100]`.
- [ ] self-feedback rejected (client == provider).
- [ ] self-validation rejected (validator == provider).
- [ ] `getReputation` on an unknown provider → `null` (no opinion), not `0`.
- [ ] after a failed verdict the score **strictly decreases**.
- [ ] anchored note contains only `{schema, provider, score, hash}` — no verdict text.
- [ ] `by_tag` uses the 9-tag taxonomy.

## Dependencies

- **Consumes:** `ctx.paymentStore[payment_id]` (from Navid). Mock `{quoted:10000, settled:12000}` to
  test the hidden-fee path before pay.js exists.
- **Produces:** `ctx.repState.getReputation(id)` (read by Reza's ranking).
