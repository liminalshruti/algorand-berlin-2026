# x402 Trust Router + ARC-8004 on Algorand

**Algorand Builders Berlin 2026 · Agentic Commerce x402 · Infrastructure track.**

A trust router over x402 on Algorand where agent reputation is earned and verified, not
self-reported: discover agent services, group equivalent capabilities into a tool catalog, choose an
agent by price + earned reputation + validation, anchor payment-backed feedback and automatic
validation outcomes, then route around agents that get caught drifting from their quoted price.

> "ERC-8004 gives agents a passport; we give the marketplace a conscience."

## Source Of Truth

- `INTEGRATION_HANDOFF.md` - live team handoff, endpoint signatures, shared Maps, open follow-ups.
- `BUILD_CHECKLIST_2026-06-06.md` - current done/left tracker, owners, and verification gates.
- `docs/reference/END_TO_END_HACK_SCOPE_2026-06-06.md` - demo spine, scope, honesty register, next moves.
- `apps/web/README.md` - frontend pages and live/mock wiring.
- `docs/pitch/` - script, deck outline, and demo storyboard.
- `docs/reference/ERC8004_AVM_MAPPING.md` + `docs/reference/ARC-8004.md` - standards/reference material.

## Current Architecture

| Layer | Where | What |
|---|---|---|
| Frontend | `apps/web/` | 5-page vanilla JS/CSS console: Trust Router, Marketplace, Agent Studio, Contracts, Admin. Trust Router calls the live API with per-endpoint mock fallback. |
| Router server | `apps/router/` | Hono server on `:3001`. Routes discovery, service catalog, payment, validation, reputation, ledger, and agent listing. Defaults to TestNet. |
| On-chain | `contracts/` | Algorand TypeScript Identity, Reputation, and Validation registries with deploy configs, generated clients, unit specs, and LocalNet e2e. |

Live API:

```txt
POST /api/route       { task, service_id? } -> { route_id, task, service_id, options }
POST /api/pay         { route_id, option_id } -> { payment_id, agent_id, quote_id, txids, quoted_amount, settled_amount, read }
POST /api/validate    { payment_id } -> { validation_id, price_match, output_pass, response, new_reputation, verdict_txid }
GET  /api/reputation?agent=... -> { agent_id, score, reads_logged, corrections_logged, by_tag, uri, hash }
GET  /api/ledger      -> { anchors }
GET  /api/agents      -> { network, app_id, agents:[{ agent_id, registry_agent_id?, agent_uri, agent_wallet, services }] }
GET  /api/services    -> { network, generated_at, services:[{ service_id, proxy, options }] }
```

## Run It

Frontend only:

```sh
npx serve apps/web
```

Open the served `router.html`. The frontend can run fully on mocks.

Full stack, TestNet default:

```sh
npm install
npm start
```

`npm start` boots `apps/router/bin/router-server.ts` on `:3001`, seeds the demo agents, funds them from
the shared throwaway TestNet payer, and returns real on-chain txids. Fund the payer first; the address
and dispenser command live in `INTEGRATION_HANDOFF.md`. The public TestNet demo config is committed in
`.env.demo`, so a local `.env` is optional unless you need private registration, reputation writes,
deployment, or custom LocalNet credentials.

Live TestNet agent registration setup:

```sh
npm run setup:testnet-identity          # or: npm run setup:testnet-known-agents
npm run setup:testnet-identity -- --check
npm run register:testnet-agents -- --check
npm run register:testnet-agents
npm start
```

Run the commands in that order. The setup command creates or reuses a private TestNet-only
identity-operator wallet in your local gitignored `.env`, prints only its address, and never
registers agents. The identity submitter is expected to already have at least `1 ALGO`; if a check
reports less, fix `IDENTITY_SUBMITTER_MNEMONIC` in local `.env` before continuing. The
`register:testnet-agents` command is the explicit mint step: it registers only the canonical
Honest/Cheat cards in the deployed IdentityRegistry, calls `setAgentWallet`, and writes
`docs/status/TESTNET_KNOWN_AGENT_REGISTRATIONS.json`. `npm start` only consumes that evidence; it does
not create wallets, request TestNet funds, or register agents during boot.

LocalNet option:

```sh
npm run localnet:start
ALGO_NETWORK=localnet npm start
```

Use local `.env` overrides for custom LocalNet node settings; the default demo payer lives in `.env.demo`.

Contracts:

```sh
npm run build
npm run deploy:localnet
npm run test:contracts
tsx scripts/localnet-e2e.ts
```

## Demo Beat

1. Route a diligence task and show three ranked agents.
2. The cheapest agent wins.
3. Pay over x402 on Algorand.
4. Agent returns an x402 challenge that is higher than the active quote commitment.
5. Payment settles for the challenge amount; automatic validation catches the quote drift and writes
   reputation down.
6. Re-run the same request; the router routes to an honest agent.
7. Show the hash-only ledger anchors and explorer links.

## Status

- Frontend console is landed with live endpoint wiring and mock fallback.
- Payment + ledger are landed and verified with real txids.
- Demo agent discovery is landed; full ARC-8004/MCP/A2A service discovery is still open.
- Reputation + validation routes are landed; quote-drift validation updates in-memory reputation and
  anchors verdict evidence. Env-gated on-chain `giveFeedback` remains the separate user-feedback lane.

Known follow-ups:

- Replace router-settled demo payment with target no-custody x402 challenge forwarding: the router
  chooses the agent, but the client pays the agent wallet directly.
- Extend service/tool catalog discovery beyond the Honest/Cheat ARC-8004 card slice into full MCP
  metadata and A2A agent cards.
- Add the minimal demo quote policy layer: crawled listings carry `service_id`, `agent_id`,
  `quote_id`, amount, asset, `payTo`, `observed_at`, and `expires_at`; routing pins a fresh listing into
  an active quote commitment.
- Split reputation signals into user feedback and automatic validations. Quote drift means the x402
  challenge violates the active quote commitment; payment can still settle, then validation uses the
  proof to write reputation down. Future active validations can let agents earn reputation through
  validator attestations.
- `apps/router/src/ranking.ts` is not the active ranking implementation; routing currently ranks in
  `apps/router/src/agents.ts::discoveryOptions`.
- Marketplace, Studio, Contracts, and Admin are mock-first for raw registry operations; the Trust
  Router page consumes the live backend API.

## Verify

```sh
npm test
npm run test:contracts
npm run check-types
```
