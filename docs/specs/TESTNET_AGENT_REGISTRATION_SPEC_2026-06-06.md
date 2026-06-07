# TestNet Agent Registration — Scope & Spec

**Owner:** Shruti (UI + Narrative lane) · drafted 2026-06-06
**Goal:** Stand up a TestNet-reachable path where an operator registers a **real agent** on-chain through the **existing ARC-8004 Identity registry interface**, and that agent shows up live in the Marketplace / Agent Studio. Replaces the mock-seeded `Helios/Vega/Comet` agents with the canonical roster, minted as real NFTs on Algorand TestNet.

> One-line: *"Someone registers a test agent → it mints on TestNet → it appears in the marketplace with a real on-chain agentId + explorer link."*

---

## 0. Why this exists

Today the agent roster is **mock-only**. `arc8004.js::seed()` invents `Helios/Vega/Comet/Arbiter` with random addresses, and the Identity registry contract is **compiled but not deployed** (see `TESTNET` follow-ups in `INTEGRATION_HANDOFF.md`). We want:

1. The deployed **IdentityRegistry** app on TestNet.
2. A **register endpoint** (`POST /api/agents/register`) that calls `register(agentURI, metadata)` on-chain via the generated client — reusing the same ABI the mock console already mirrors.
3. The roster seeded with the **real agents**, each minted on-chain.
4. The frontend pointed at **TestNet + real app-ids** instead of `localnet` + mock ids.

This is the "deploy a test endpoint, register the real agents" task. It depends on the TestNet deploy gaps already catalogued; this spec assumes those get closed as part of step 1.

---

## 1. The existing interface to reuse (do NOT reinvent)

### 1.1 On-chain — `IdentityRegistry.register`
`contracts/identity_registry/contract.algo.ts:65`

```
register(agentURI: string, metadata: (string,byte[])[]) -> uint64   // agentId
```
- Mints an ARC-72 NFT to `Txn.sender`; sets `owner = agentWallet = Txn.sender`.
- `metadata` is an array of `{ key: string, value: byte[] }` (`MetadataEntry`). Key `agentWallet` is reserved.
- Generated client: `contracts/artifacts/identity_registry/IdentityRegistryClient.ts`
  - Factory: `IdentityRegistryFactory` · Client: `IdentityRegistryClient`
  - Call shape (mirror `identity-onchain.ts`): `client.send.register({ sender, args: { agentUri, metadata } })` → returns agentId in the ABI return + a `Registered` ARC-28 event.

### 1.2 Server — route + on-chain module patterns
- Endpoint pattern: `apps/router/src/routes.agents.ts::makeAgentRoutes(ctx)` (Hono sub-app, wired in `router-server.ts` via `app.route('/', …)`).
- On-chain call pattern (env-gated, best-effort, dynamic import): `apps/router/src/onchain.ts::maybeWriteReputation` — **copy this exact shape** for identity writes.
- In-memory agent store + validation: `apps/router/src/agents.ts::registerAgentLocal` (validates `agent_wallet`, stores `Agent` in `ctx.agents`).
- TestNet payer/algod + `ctx.deps`: `apps/router/src/context.ts` (already TestNet-default).

### 1.3 Frontend — register flow that already exists
- Agent Studio page: `apps/web/studio.html` (`data-view="manage"`), engine `apps/web/registry.js`.
- The "Register a new agent" form + `ACTIONS.register` already call the mock `A.id.register(uri, [[name],[register]])` (`registry.js`). We make this hit the **live endpoint** when a network flag is on, else fall back to the mock (same mock-first pattern as `router.js`).
- Chain context badge + app-ids: `apps/web/arc8004.js` (`NET`, `APP`, `GENESIS`) and `registry.js::renderChainCtx`.

---

## 2. The Agent Roster (canonical seed data)

Source of truth: canonical seed data for the 12-agent agency across 4 registers. On-disk roster:

| Register | Agents | Router register (UI) |
|---|---|---|
| diligence | Operator, Synthesizer, Witness | **Diligence** |
| outreach  | Planner, SDR | **Outreach** |
| synthesis | Strategist, Editor | **Operations** ⚠️ (see §6 decision) |
| judgment  | Contrarian, Manager | **Judgment** |

Each agent registers as:
- `agentURI` — a resolvable card. **Decision needed (§6):** `ipfs://…` pinned card, or hosted HTTPS card. Interim: `https://agents.local/<slug>` (matches current `seed.ts` convention) until real cards are pinned.
- `metadata` — at minimum:
  - `name` → e.g. `"Operator"`
  - `register` → e.g. `"Diligence"`
  - `role` → one-line from the agency canon (e.g. Witness = "reads what is materially/somatically true of an artifact").
  - (optional) `quote` / `asset` if we want these to also be routable agents in the trust router.

> The **adversary stays**: keep ONE labeled `Cheat Agent` (test agent) per the earlier decision, so the demo's "caught + rerouted" beat still has a target. It is explicitly labeled a test fixture, not a roster agent.

---

## 3. New surface — endpoints

Use the Hono sub-app `makeAgentRoutes(ctx)` in **`apps/router/src/routes.agents.ts`**. It owns local agent discovery/routing plus the Identity registration surface and is mounted with `app.route('/', makeAgentRoutes(ctx))`.

### 3.1 `POST /api/agents/register`
Register an agent on-chain (TestNet) via the Identity registry.

**Request**
```jsonc
{
  "name": "Operator",
  "agent_uri": "https://agents.local/operator",
  "address": "NDX7OC2…HVUCIQ"                                    // agent_wallet/payTo
}
```

**Behaviour**
1. Validate `name` + `agent_uri` + `address` non-empty.
2. Build `metadata = [["name",name]]` (utf-8 → byte[]).
3. Call `identityOnchain.registerAgent(ctx, { agentURI, metadata })` (§4). The **submitter wallet is the owner** (single consistent wallet — Reza's — per the no-impersonation decision; see §6).
4. Store the identity in `ctx.agents` keyed by `agent_id = algorand:{net}:{agent_wallet}` and add one default MCP service for the demo route.
5. Return:
```jsonc
{
  "agent_id": "algorand:testnet:NDX7…",   // router identity
  "registry_agent_id": "1",               // on-chain uint64 when available
  "tx_id": "ABC…",                        // register txn
  "app_id": 1001,                         // IdentityRegistry app id
  "owner": "NDX7OC2…HVUCIQ",
  "agent_uri": "https://agents.local/operator",
  "explorer": "https://lora.algokit.io/testnet/transaction/ABC…",
  "on_chain": true                        // false when env not configured (mock fallback)
}
```
6. **Env-gated, best-effort:** if `IDENTITY_APP_ID` / submitter mnemonic are unset, return `on_chain:false` and keep the local router identity live.

### 3.2 `GET /api/agents`
List routable agents from the in-memory mirror plus on-chain registration state when available, so the Marketplace can render the live roster.
```jsonc
{ "network": "testnet", "app_id": 1001,
  "agents": [{ "agent_id":"algorand:testnet:NDX7…", "registry_agent_id":"1", "name":"Operator",
               "agent_uri":"…", "agent_wallet":"NDX7…",
               "services":[{ "service_id":"diligence.report", "protocol":"MCP", "endpoint":"…/mcp", "name":"Diligence report" }] }] }
```
Reads via the generated client's readonly methods (`ownerOf`, `getAgentURI`, `getMetadata`, `arc72_totalSupply`, `tokenByIndex`). For the demo a thin cache in `ctx` is acceptable; full chain-scan is optional.

---

## 4. New module — `apps/router/src/identity-onchain.ts`

Copy `onchain.ts` structure exactly (dynamic import, try/catch, env gate). Public surface:

```ts
export interface RegisteredAgent { agentId: string; txid: string; appId: number; owner: string; }
export async function registerAgent(
  ctx: Ctx,
  input: { agentURI: string; metadata: [string, Uint8Array][] }
): Promise<RegisteredAgent | null>;     // null when IDENTITY_APP_ID/mnemonic unset
export async function listAgents(ctx: Ctx): Promise<RegisteredAgent[]>;  // optional
```

Env vars (document in README + a new `.env.example`):
- `IDENTITY_APP_ID` — deployed IdentityRegistry app id (from step 1).
- `IDENTITY_SUBMITTER_MNEMONIC` — funded TestNet wallet that becomes the owner (falls back to `PAYER_MNEMONIC`; for the consistent-wallet story this should be **Reza's** wallet's mnemonic, kept out of git).
- Reuses `ALGOD_URL/PORT/TOKEN` from `context.ts`.

Encoding notes (match `onchain.ts`): use `AlgorandClient.fromEnvironment()` + `getTypedAppClientById(IdentityRegistryClient, { appId, defaultSender })`. `metadata` values are `byte[]` — encode strings with `new TextEncoder().encode(v)`.

---

## 5. Frontend changes (my lane)

1. **Network flip.** `apps/web/router.js` `NETWORK` and `apps/web/arc8004.js` `NET` → `"testnet"` (gate behind a single const so it's one edit). Explorer + chain-ctx badge then read TestNet.
2. **Real app-ids.** Replace `arc8004.js` `APP = {identity,reputation,validation}` mock `1001/1002/1003` with the deployed ids (inject via a small `apps/web/chain-config.js` written at deploy time, or hand-edit tonight).
3. **Live register.** In `registry.js`, add a `LIVE_AGENTS` flag + `BASE_URL`. When on, `ACTIONS.register` and `simulate-pay`-adjacent flows `fetch('/api/agents/register')` instead of the mock `A.id.register`; on success, hydrate the console from `GET /api/agents`. Mock fallback preserved (same pattern as `router.js`).
4. **Roster seed.** Replace `arc8004.js::seed()`'s `Helios/Vega/Comet/Arbiter` with the §2 roster (keep one labeled test/cheat agent). This keeps the mock path showing the *real* names even before TestNet is wired.
5. **Consistent wallet.** Registered agents are owned by the fixed operator wallet already pinned in `arc8004.js` (`FIXED_WALLET`) — no change, just confirm the owner display matches.

---

## 6. Decisions to lock before/while building (don't block on these tonight — pick the default)

| # | Decision | Default |
|---|---|---|
| D1 | **Synthesis vs Operations** register name. Canonical register = `synthesis`; router UI = `Operations`. | Map `synthesis → Operations` in the seed (one rename), OR add `Synthesis` as a 5th register chip. **Default: map to Operations** (fewer UI changes). |
| D2 | **agentURI hosting** — ipfs vs https vs interim local. | Interim `https://agents.local/<slug>` tonight; swap to pinned `ipfs://` cards before judging. |
| D3 | **Ownership** — all agents owned by one wallet (Reza's) vs per-agent wallets. | One wallet (matches the no-impersonation decision). Note: with one owner, the operator can't *review* its own agents (self-review guard) — fine, reviews come from buyer wallets in the marketplace flow. |
| D4 | **Routable or display-only** — do registered agents also get `quote`/`asset` so they appear in `/api/route` ranking? | Yes for the 9 roster agents (give them quotes), so the trust router demos over real agents too. |
| D5 | **Reputation seeding** — real agents start with no reviews. | Acceptable (shows "new" badge). Optionally seed a few verified reviews via `/api/validate` for the hero agent. |

---

## 7. Runbook — what to do tonight (in order)

> Prereq: TestNet deploy gaps from `INTEGRATION_HANDOFF.md` closed (registries deployed, app-ids known). Steps 1–2 are the contracts/server lane; 3–5 are mine.

1. **Deploy registries to TestNet.**
   ```bash
   export DEPLOYER_MNEMONIC="<funded testnet 25-word>"
   export ALGOD_SERVER=https://testnet-api.algonode.cloud ALGOD_PORT=443 ALGOD_TOKEN=""
   npm run build && npm run deploy        # deploys identity + reputation + validation
   ```
   Record the three `appId`s printed by each `deploy-config.ts`.
2. **Configure + start the server.** Put in `.env` (gitignored): `IDENTITY_APP_ID`, `REPUTATION_APP_ID`, `VALIDATION_APP_ID`, `IDENTITY_SUBMITTER_MNEMONIC` (Reza's, funded). `npm start`.
3. **Register the roster.** `curl -X POST localhost:3001/api/agents/register` per agent (or `POST /api/agents/seed` if built). Confirm each returns `on_chain:true` + an explorer link that resolves on `lora.algokit.io/testnet`.
4. **Point the frontend at TestNet.** Flip `NETWORK`/`NET` to `testnet`; drop the real app-ids into `arc8004.js` (or `chain-config.js`); set `LIVE_AGENTS=true`.
5. **Verify the loop.** Open Marketplace → real roster agents render with on-chain agentIds; open Agent Studio → register a new test agent through the form → see it mint on TestNet with an explorer link. Run the trust-router demo over the roster (cheat agent still gets caught + rerouted).

---

## 8. Acceptance criteria

- [ ] IdentityRegistry deployed to TestNet; `app_id` known and in `.env`.
- [ ] `POST /api/agents/register` returns a **real TestNet txid** (`on_chain:true`) that resolves on the explorer, and a monotonically increasing on-chain `agent_id`.
- [ ] The 9 canonical agents (Operator, Synthesizer, Witness, Planner, SDR, Strategist, Editor, Contrarian, Manager) are registered on-chain and appear in `GET /api/agents` and the Marketplace.
- [ ] Agent Studio "Register a new agent" form mints on TestNet end-to-end (no mock) when `LIVE_AGENTS=true`, with a mock fallback when the server is down.
- [ ] All registered agents are owned by the single consistent operator wallet; no impersonation affordances reintroduced.
- [ ] One labeled test/adversary agent remains for the "caught + rerouted" beat.
- [ ] Chain-ctx badge + explorer links read `testnet` and the real app-ids.

---

## 9. Files touched (summary)

| File | New? | Lane | Change |
|---|---|---|---|
| `apps/router/src/routes.agents.ts` | edit | server | `makeAgentRoutes(ctx)` — `GET /api/agents`, `POST /api/route`, `POST /api/agents/register`, opt `POST /api/agents/seed` |
| `apps/router/src/identity-onchain.ts` | edit | server | env-gated `registerAgent` via generated `IdentityRegistryClient` |
| `apps/router/bin/router-server.ts` | edit | Navid (ask) | one `app.route('/', makeAgentRoutes(ctx))` line |
| `.env.example` | new | shared | document `IDENTITY_APP_ID`, `*_SUBMITTER_MNEMONIC`, algod vars |
| `apps/web/arc8004.js` | edit | UI | `NET="testnet"`, real `APP` ids, roster = real agents |
| `apps/web/registry.js` | edit | UI | `LIVE_AGENTS` flag + live `fetch` register/list with mock fallback |
| `apps/web/router.js` | edit | UI | `NETWORK="testnet"` |
| `INTEGRATION_HANDOFF.md` | edit | UI | add the agents endpoints under the relevant section when landed |
| `README.md` | edit | UI | document the register endpoint + env vars |

---

## 10. Out of scope (explicitly)

- x402 `paymentTxid`/`nonce` on on-chain `giveFeedback` (tracked separately in `INTEGRATION_HANDOFF.md`).
- On-chain `validationResponse` writes (validation stays hash-only anchored for now).
- IPFS pinning infra (interim https/local cards acceptable for the demo).
- Per-agent funded wallets (single owner wallet by decision D3).
- Restoring deleted legacy router or x402 files (off-limits per `CLAUDE.md`).
