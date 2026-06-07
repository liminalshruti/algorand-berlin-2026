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
POST /api/challenge   { route_id, option_id } -> { challenge_id, agent_id, quote_id, amount, asset, pay_to, network, nonce, payment_note, quote_drift }
GET  /api/challenge/:challenge_id -> { challenge_id, amount, pay_to, payment_note, quote_drift, payment_txid? }
POST /api/payment-proof { challenge_id, txid, payer } -> { accepted, policy_result, validation_id, new_reputation }
POST /api/feedback/intent { challenge_id, payment_txid, payer, response } -> { feedback_intent_id, note, note_hash, expires_at }
POST /api/feedback    { feedback_intent_id, auth_txid } -> { accepted, feedback_id, new_reputation, rebate_txid }
POST /api/pay         { route_id, option_id } -> { payment_id, agent_id, quote_id, txids, quoted_amount, settled_amount, read }
POST /api/validate    { payment_id } -> { validation_id, price_match, output_pass, response, new_reputation, verdict_txid }
GET  /api/reputation?agent=... -> { agent_id, score, reads_logged, corrections_logged, by_tag, uri, hash }
GET  /api/ledger      -> { anchors }
GET  /api/agents      -> { network, app_id, agents:[{ agent_id, registry_agent_id?, agent_uri, agent_wallet, services }] }
GET  /api/services    -> { network, generated_at, services:[{ service_id, proxy, options }] }
POST /mcp             -> Claude Code MCP Streamable HTTP tools
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
npm run agents:local   # separate terminal; local Honest/Cheat MCP/x402 providers on :4021
npm start
```

`npm start` boots `apps/router/bin/router-server.ts` on `:3001`, seeds the demo agents, funds them from
the shared throwaway TestNet payer, and returns real on-chain txids. Fund the payer first; the address
and dispenser command live in `INTEGRATION_HANDOFF.md`. The public TestNet demo config is committed in
`.env.demo`, so a local `.env` is optional unless you need private registration, reputation writes,
deployment, or custom LocalNet credentials.
Known Honest/Cheat quotes are pre-probed from the local x402 provider into the router's in-memory
quote cache: Honest returns `0.10 ALGO` for quote and execution; Cheat returns `0.04 ALGO` for quote
and `0.06 ALGO` for execution.
Both providers expose the same tiny paid tool, `answer_obvious_claim`: `Return whether the claim
"2 + 2 = 4" is true.` Honest returns `true`; Cheat returns `false`.

Claude Code MCP demo:

```sh
npx serve -l 3000 apps/web
LOW_SPEND_SMOKE=true WEB_BASE_URL=http://localhost:3000 npm start
claude mcp add --transport http liminal http://localhost:3001/mcp
```

Ask Claude Code to list Liminal services, route a diligence task, request payment, open the returned
`sign_url`, then record the payment proof and invoke the paid service. The `sign_url` opens
`apps/web/mcp-sign.html`, which signs the exact x402 challenge with Pera on TestNet and posts
`/api/payment-proof`.

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
- Agent-hosted quote ingestion is landed for Honest/Cheat: `npm run agents:local` serves localhost
  MCP/x402 providers, and `/api/route` pins active quotes from cached 402 quote snapshots.
- Reputation + validation routes are landed; quote-drift validation updates in-memory reputation and
  anchors verdict evidence. Env-gated on-chain `giveFeedback` remains the separate user-feedback lane.
- Proof-backed trust routes are landed: `/api/challenge` forwards execution x402 requirements,
  `/api/payment-proof` verifies direct payment proofs and lowers reputation for quote drift only, and
  `/api/feedback` requires payer wallet control through a 0-ALGO self-payment auth note. Optional
  router-sponsored feedback rebate is controlled by `FEEDBACK_REBATE_ENABLED` and
  `FEEDBACK_REBATE_ALGO`.
- MCP facade is landed: `POST /mcp` exposes `liminal_list_services`, `liminal_route_task`,
  `liminal_request_payment`, `liminal_record_payment_proof`, and `liminal_invoke_paid_service` for
  Claude Code. Paid invocation forwards to the selected local MCP/x402 provider after proof.
  Honest/Cheat provider tools are intentionally trivial and deterministic: the same
  `answer_obvious_claim` description returns `true` for Honest and `false` for Cheat.

Known follow-ups:

- Wire the main Trust Router page to the target no-custody x402 challenge/proof flow. The MCP Pera
  signing page consumes the proof endpoints; the main page still primarily drives the router-settled
  `/api/pay` shim.
- Extend service/tool catalog discovery beyond the Honest/Cheat ARC-8004 card slice into full MCP
  metadata and A2A agent cards.
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
