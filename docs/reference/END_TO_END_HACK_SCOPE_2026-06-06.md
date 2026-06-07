# End-to-End Scope - Current Demo Spine

**Date:** 2026-06-06 · **Category:** Infrastructure · **Problem:** agentic trust

This is the active scope for the landed x402 Trust Router demo and the next integration moves.

## One Sentence

A trust router over x402 on Algorand: discover agent services, group equivalent capabilities into a
tool catalog, choose a concrete agent by price + earned reputation + validation, let the client pay
that agent over x402, then use payment proof, user feedback, and automatic validation outcomes to
update future routing.

## Value Prop

Agent marketplaces can rank on price plus self-reported reputation. That is gameable: the cheapest
agent can win with one quote, ask for more in the x402 challenge, and keep its reputation. This build
makes reputation earned: payment evidence, validation, and reputation are joined on Algorand.

## What Runs Now

| Layer | Current state |
|---|---|
| Agent discovery | 3 seeded identities; `GET /api/agents`; one resolved MCP service. Full MCP/A2A/ARC-8004 service discovery is still open. |
| Routing | `POST /api/route`; ranks candidates in `agents.ts::discoveryOptions`; writes `ctx.routeStore`. |
| Payment | `POST /api/pay`; current demo settles through the router's payer. Target flow forwards the selected agent's x402 challenge so the client pays the agent directly. |
| Validation | `POST /api/validate`; current demo compares quoted vs settled. Target validation compares active quote commitment vs x402 challenge/settlement proof. |
| Reputation | `GET /api/reputation`; in-memory state used by the next route; env-gated on-chain `giveFeedback` path exists. |
| Ledger | `GET /api/ledger`; hash-only anchors with txid, schema, ref id, hash, round, network. |
| Frontend | `apps/web/router.html` live API flow with per-endpoint fallback; other console pages are mock-first for raw registries. |
| Contracts | Identity, Reputation, and Validation registries built in Algorand TypeScript with generated clients and tests. |

## Dataflow

```txt
operator task
  -> discover/group services from ARC-8004 + MCP + A2A + local agents
  -> quote policy pins fresh listing into active quote commitment
  -> choose concrete agent by price + reputation + validation
  -> forward selected agent's x402 challenge
  -> record quote/challenge drift or wallet mismatch
  -> client pays selected agent wallet directly
  -> txid + nonce become proof
  -> automatic validation or user feedback updates reputation
  -> next route reads reputation and avoids caught agent
```

## Target Happy Flow

1. Agent registers an ARC-8004 identity with `agent_uri`, MCP/A2A service metadata, and an
   agent wallet that can receive Algorand payments.
2. Router discovers or accepts agents, resolves MCP/A2A descriptions, and extracts capability names
   and descriptions.
3. Router semantically groups equivalent capabilities into service/tool descriptions exposed by the
   proxy.
4. Quote policy checks minimal listing metadata: `service_id`, `agent_id`, `quote_id`, amount, asset,
   `payTo`, `observed_at`, and `expires_at`. Fresh listings become active quote commitments.
5. Client agent calls the proxy tool. Router selects the concrete agent by price, reputation, and
   availability.
6. Router forwards the selected agent's x402 payment requirements. The client pays the agent
   directly; the router does not custody or settle the payment.
7. If the challenge amount, asset, or `payTo` differs from the active quote commitment, the router
   records the mismatch but does not block the TestNet happy-flow payment.
8. Client receives `paymentTxid`/nonce proof after settlement.
9. Router triggers automatic validation for objective quote drift such as wrong amount, wrong `payTo`,
   invalid challenge, replay, timeout, or agent unavailability.
10. User feedback is separate: the client may submit satisfaction feedback tied to the same payment
   proof, deduped by `paymentTxid` + `nonce`, and written through `giveFeedback` when the registry path
   is enabled.
11. Future active validations let agents ask validators to test their service and earn reputation
    through attestations, including optional zero-knowledge proofs.

## Demo Flow

1. Start `npm start` and serve `apps/web/`.
2. Route a diligence task.
3. Show agent ranking with the cheap cheat agent selected.
4. Approve payment.
5. Show real txid(s), active quote amount, x402 challenge amount, and settled amount.
6. Validate; show the quote-drift verdict and reputation drop.
7. Re-run the route; show the honest agent now leading.
8. Open the ledger and explorer link.

## In Scope

- TestNet or LocalNet x402 settlement with real txids.
- Hash-only ledger anchors.
- Automatic active-quote-vs-challenge validation after payment settlement.
- Minimal quote policy layer for fresh listing -> active quote commitment.
- Payment-backed user feedback as a separate signal.
- Future active validation / attestation path.
- Reputation write-back that affects the next route.
- ARC-8004-shaped Algorand-native registry contracts.
- Judge-facing demo, script, deck, and storyboard.

## Out Of Scope

- Live Agent.market dependency.
- Production DB, TTLs, or persistence beyond the demo state.
- Desktop wiring.
- General-purpose output oracle claims.
- Reintroducing the prior Liminal-substrate demo or pre-Berlin logistics into active docs.

## Next Moves

- Replace the router-settled demo payment path with no-custody x402 challenge forwarding.
- Add service/tool discovery from ARC-8004 registration files, MCP metadata, and A2A agent cards.
- Add minimal quote metadata and policy: `service_id`, `agent_id`, `quote_id`, amount, asset,
  `payTo`, `observed_at`, `expires_at`; no signatures or dynamic pricing in demo scope.
- Add feedback intake keyed by `paymentTxid` + `nonce`.
- Add automatic validation for quote drift, wrong `payTo`, invalid challenge, replay, timeout, and
  agent unavailability.
- Add future active validation / attestation path for agent-earned reputation, including optional ZK
  proof support.
- Decide whether to wire or delete the unused `apps/router/src/ranking.ts` stub.
- Deploy registry app ids to TestNet if the pitch needs public app ids rather than LocalNet e2e proof.
- Keep Marketplace/Studio/Contracts/Admin mock-first until raw registry backend endpoints are in scope.

## Honesty Register

- ERC-8004 is not deployed on Algorand; this project is ERC-8004-shaped and Algorand-native.
- The trust router settlement and ledger anchors are live on Algorand.
- Current ranking is router-side; it reads the reputation mirror and is not a fully on-chain ranking
  algorithm.
- "Validated reputation" means the specific checks we run: active quote vs x402 challenge,
  challenge/settlement proof, optional output checks, and future validator attestations.
