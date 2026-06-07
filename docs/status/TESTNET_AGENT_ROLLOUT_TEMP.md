# TestNet Agent Rollout Handoff

Execution handoff for the next implementation chat. This slice moves the demo from purely seeded
agents toward real TestNet-registered agent identities, while keeping the current router demo loop
intact.

## Objective

Implement this first real-agent rollout slice:

```txt
Honest Agent + Cheat Agent
  -> off-chain agent_uri service cards
  -> registered on the existing TestNet IdentityRegistry
  -> router ingests cards into ctx.agents and ctx.services
  -> GET /api/services exposes one grouped diligence.report proxy service
```

Keep the work demo-focused. The goal is to make the discovery/proxy layer real enough that the
router is no longer only seeded by `seed.ts`, without taking on full ARC-8004/MCP/A2A discovery.

## In Scope

- Define the minimal ARC-8004 `agent_uri` registration-file shape without router-owned proxy fields.
- Create or document hosted cards for Honest Agent and Cheat Agent.
- Give both agents stable TestNet wallets.
- Mark both agents x402-compatible in their ARC-8004 registration files.
- Register both `agent_uri` values on the existing TestNet IdentityRegistry, or document the blocker.
- Add router ingestion from `agent_uri` card into existing local state for identity, wallet, and MCP endpoint facts.
- Add a router-owned demo quote adapter for route-time quote/payment requirement creation.
- Add `GET /api/services`, grouped by proxy service.
- Keep existing `GET /api/agents` and `POST /api/route` compatible.
- Add tests for card parsing, service grouping, route-time quote metadata, and route-by-service.

## Out Of Scope

- Do not remove or rewrite the current `/api/pay` route.
- Do not remove or rewrite the current `/api/validate` route.
- Do not remove the current cheat quote-drift demo behavior.
- Do not add `/api/challenge` in this slice.
- Do not implement no-custody x402 payment in this slice.
- Do not implement external payment proof verification in this slice.
- Do not implement `POST /api/feedback` in this slice.
- Do not require frontend consumption of `/api/services` in this slice.
- Do not implement full ARC-8004 chain scan, MCP tool-list parsing, A2A adapter, or semantic clustering.
- Do not redeploy the registry contracts.

## Current Repo State

- Current agents are seeded in memory by `apps/router/src/seed.ts` as fallback.
- Router boot attempts Honest/Cheat card ingestion from the raw GitHub URL for `docs/agents/testnet/manifest.json`, then falls back to the direct Honest/Cheat card URLs; fetch failure is non-fatal.
- Current live discovery endpoints are `GET /api/agents`, `GET /api/services`, and `POST /api/route`.
- There is no `GET /api/tools` yet.
- `/api/pay` is router-settled through the shared demo payer.
- `/api/validate` currently compares `PaymentResult.settled <= PaymentResult.quoted`.
- `apps/router/src/identity-onchain.ts` has env-gated Identity registration helpers.
- TestNet registry contracts are already deployed:
  - IdentityRegistry: `764031067`
  - ReputationRegistry: `764031363`
  - ValidationRegistry: `764031094`

## Stable TestNet Agent Wallets

Use these Pera-created TestNet wallets for the first Honest/Cheat rollout cards:

- Honest Agent: `J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY`
- Cheat Agent: `3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ`

For this slice, each card's `algorand-wallet` service entry should be the address above. These wallets
are the receiving wallets for router-settled demo payments and for the router-owned demo quote adapter.
Both Honest and Cheat cards should set `x402Support: true`; all exposed `diligence.report` options
are treated as x402-compatible, even though settlement still uses the demo facilitator shim below.

Current `/api/pay` role:

- `/api/pay` acts as the demo x402 facilitator shim.
- It receives `{ route_id, option_id }`, looks up the active quote/payment requirement, and settles
  TestNet ALGO from the shared router payer to the selected option's `pay_to` wallet.
- It then records `ctx.paymentStore` and anchors the hash-only ledger entry.
- True no-custody x402 payment, payment proof capture, and external proof verification are deferred.

Current quote role:

- ARC-8004 agent cards do not carry router proxy service ids or quote amounts.
- Card ingestion stores identity, wallet, and MCP endpoint facts only.
- The router-owned demo quote adapter derives route-time quotes:
  - Honest Agent: `0.1 ALGO` quoted and requested.
  - Cheat Agent: `0.04 ALGO` quoted, `0.06 ALGO` requested for quote-drift validation.
- Later real agent x402 quote/challenge endpoints should replace the demo adapter.

## MCP Demo Topology

```txt
Demo MCP client
  -> Trust Router MCP server / router proxy
      -> Honest Agent MCP endpoint
      -> Cheat Agent MCP endpoint
```

- The Trust Router owns the proxy tool surface, including `diligence.report`.
- Honest and Cheat each expose one logical partner-agent MCP endpoint through `services[]`.
- The router ingests those endpoint facts, ranks eligible agents, chooses the settlement partner, and
  forwards work to the selected partner endpoint.
- Localhost partner endpoints are acceptable for a local demo run, but they belong in router-owned
  runtime config or overrides, not in portable public card metadata unless the card is explicitly
  local-only.

Identity registration caveat:

- The deployed IdentityRegistry sets `owner == agentWallet == Txn.sender` during `register(...)`.
- The current backend helper signs registration only with `IDENTITY_SUBMITTER_MNEMONIC`, so registry
  owner/wallet will be the submitter unless registration is Pera-signed or the owner later calls
  `setAgentWallet(registry_agent_id, PeraAddress)`.
- Local router/card ingestion can still use the Pera wallets as canonical `agent_wallet`/`pay_to`.

## Canonical Card Artifacts

- Manifest: `docs/agents/testnet/manifest.json`
  - `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/manifest.json`
- Honest Agent: `docs/agents/testnet/honest-agent.json`
  - `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/honest-agent.json`
- Cheat Agent: `docs/agents/testnet/cheat-agent.json`
  - `https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/cheat-agent.json`

Status: local Honest/Cheat card files and raw GitHub URLs are the canonical clean ARC-8004 cards. If the
manifest URL is not available at runtime, the router falls back to the direct Honest/Cheat card URLs.

## Must Read First

- `INTEGRATION_HANDOFF.md`
- `BUILD_CHECKLIST_2026-06-06.md`
- `docs/status/DEPLOYED.md`
- This file

Optional background:

- `docs/reference/END_TO_END_HACK_SCOPE_2026-06-06.md`

## Guardrails

- Do not read or use anything under `ref/archive/` or any path containing `/archive/`.
- Do not restore deleted legacy router or x402 files.
- Treat `apps/router/src/contract.ts` as shared API. Make additive shape changes only when needed.
- Keep route handlers inside route factories, especially `apps/router/src/routes.agents.ts`.
- Do not run `npm start` casually on TestNet; it can spend TestNet funds by funding/registering seeded agents.
- Keep this file and `INTEGRATION_HANDOFF.md` current as implementation lands.

## Tightened Decisions Before Implementation

These decisions are fixed for this slice unless this file is updated first.

- Card hosting: create canonical Honest/Cheat JSON artifacts in this public GitHub repo. During
  implementation, tests should use the same repo files as fixtures. After the artifacts are pushed,
  record the final raw GitHub or GitHub Pages HTTPS URLs in this file and use those as `agent_uri`.
- Runtime ingestion: start with local fixture/card ingestion in tests. Once final GitHub URLs are
  known, router boot should attempt card ingestion automatically from a committed manifest, but card
  fetch failure must be non-fatal and fall back to the seeded demo path.
- Seed replacement: when card ingestion succeeds, card-backed Honest/Cheat entries replace the seeded
  Honest/Cheat catalog entries. Avoid duplicate Honest/Cheat options if both paths are enabled.
- Services catalog: `GET /api/services` exposes a combined `diligence.report` service group. In the
  successful real-agent path, that group contains only the two card-backed Honest/Cheat options. Budget
  Agent may remain available as seeded fallback, but it is not part of the real-agent catalog unless a
  real card is added for it.
- Quote freshness: cards do not publish quotes. `/api/services` may expose router-derived demo quote
  snapshots with `amount`, `asset`, and `pay_to`; active `/api/route` quotes are created at route time
  with both `observed_at` and `expires_at`.
- Registration path: prefer backend-signed TestNet registration for this slice, followed by
  `setAgentWallet(registry_agent_id, PeraAddress)` so `getAgentWallet` can match the Pera receiving
  wallet. Pera-signed registration is more ownership-correct, but it adds wallet app-call plumbing that
  is not needed for this discovery slice. If no funded submitter is available, keep local/card ingestion
  working and record registration as blocked.
- Phase log updates: implementation should update the Phase Validation Log programmatically as each
  phase gate passes or blocks. Do not rely on memory-only status updates.

## Work Sequence

1. Pick and document the hosting location for the two JSON cards.
   - Use this public GitHub repo for canonical JSON artifacts.
   - Raw GitHub or GitHub Pages HTTPS URLs are acceptable after the artifacts are pushed.
   - A temporary HTTPS tunnel is acceptable only if the final GitHub URI is recorded before TestNet
     registration.

2. Define the `agent_uri` registration-file TypeScript shape and validation helper.
   - Use the ARC-8004 registration discriminator `type`, not a local `schema` field.
   - Required fields: agent name, MCP endpoint, Algorand wallet service, `x402Support: true`, `active: true`.
   - Do not read or require `trust_router`, router service ids, or quote fields from public agent cards.
   - Do not require challenge/proof fields yet.

3. Add a card resolver.
   - Fetch a JSON card from `agent_uri`.
   - Validate service and wallet fields.
   - Return a typed normalized card.

4. Add ingestion helpers.
   - Convert card identity into `registerAgentLocal`.
   - Convert card MCP endpoint into a router-owned `diligence.report` proxy service via `registerServiceLocal`.
   - Do not store card-authored quote templates; route-time quote collection owns payment requirements.
   - Preserve existing seeded fallback behavior.

5. Add `GET /api/services`.
   - Group by `service_id`.
   - Return service-level proxy name and description.
   - Inline compact option snapshots for each candidate agent.
   - Derive quote snapshots from the router-owned demo quote adapter.
   - Do not expose hidden cheat behavior in the public catalog.

6. Register Honest and Cheat on TestNet.
   - Use the existing IdentityRegistry app id `764031067`.
   - Record `registry_agent_id`, owner, txid, and explorer link.
   - If blocked, document exactly why and leave local ingestion working.

7. Verify.
   - `npm test`
   - `npm run check-types`
   - `POST /api/route { "service_id": "diligence.report" }` still works.

## Phased Execution And Gates

Use these phases in order. At the end of each phase, update the Phase Validation Log below and do
not move to the next phase until the gate is `PASS`, or `BLOCKED` with a concrete workaround recorded
in this file.

### Phase 0 - Baseline, Hosting, And Registration Decision

Purpose: make the external surfaces stable before code starts depending on them.

- Read the Must Read First docs and confirm the current TestNet app ids.
- Pick the repo path for the Honest/Cheat JSON artifacts and record the expected final GitHub HTTPS
  URL shape.
- Decide the registration path:
  - backend-signed registration followed by `setAgentWallet(registry_agent_id, PeraAddress)`
    (recommended for this slice); or
  - Pera-signed registration by each wallet; or
  - backend-signed registration with the on-chain wallet mismatch documented as a blocker.
- Do not redeploy registry contracts.

Gate:

- Final card URL plan is recorded, even if the cards are not hosted yet.
- IdentityRegistry remains `764031067`; ReputationRegistry remains `764031363`; ValidationRegistry
  remains `764031094`.
- The owner/wallet registration caveat has a chosen path or a documented blocker.
- No TestNet-spending command is required for this phase.

### Phase 1 - Card Shape, Fixtures, And Parser

Purpose: define the smallest trustworthy ARC-8004 registration-file contract before wiring network
fetches.

- Add TypeScript types only where needed for shared wire shapes.
- Add fixtures for Honest Agent and Cheat Agent cards.
- Add the validation helper for:
  - `type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`;
  - `services[]` containing `MCP` and `algorand-wallet`;
  - valid Algorand wallet format;
  - `x402Support: true`;
  - `active: true`;
  - no required challenge/proof fields.
- Do not parse router-owned service ids, proxy metadata, or quote fields from public agent cards.

Gate:

- Tests cover valid Honest/Cheat fixtures.
- Tests reject missing MCP, missing wallet, invalid wallet, missing `x402Support`, inactive card, and
  invalid MCP endpoint.
- `npm test` passes.

### Phase 2 - Resolver And Local Ingestion

Purpose: load hosted or fixture-backed cards into the existing router state without card-authored
quotes or router-specific metadata.

- Add a card resolver that fetches JSON from `agent_uri` and returns a normalized card.
- Add ingestion helpers that call `registerAgentLocal` for card identity facts.
- Register a router-owned `diligence.report` proxy service for each card-backed MCP endpoint.
- Preserve current seeded fallback/demo agents.
- Dedupe by stable agent identity and service option key so Honest/Cheat do not appear twice if seed
  and card ingestion both run.
- When final GitHub URLs are known, load them from a committed manifest on boot. Fetch failure should
  log a clear warning and keep the seeded fallback path alive.

Gate:

- Tests prove ingestion populates `ctx.agents` and `ctx.services`.
- Tests prove card-backed services do not depend on card-authored quote metadata.
- Tests prove seeded fallback still works when card fetch is unavailable or disabled.
- Tests prove `GET /api/agents` remains compatible.
- Tests prove duplicate Honest/Cheat entries are not emitted.
- `npm test` passes.

### Phase 3 - MCP Proxy Catalog And Route Compatibility

Purpose: expose the Trust Router proxy surface and keep the current route/pay/validate loop intact.

- Add `GET /api/services` in `makeAgentRoutes(ctx)`.
- Group options by `service_id`.
- Include compact option snapshots: agent identity, `registry_agent_id?`, `agent_uri`, wallet, MCP
  endpoint, router-derived quote snapshot, and reputation.
- When card ingestion succeeds, expose one combined `diligence.report` group with only card-backed
  Honest/Cheat options.
- Keep `POST /api/route { "service_id": "diligence.report" }` compatible with `/api/pay`.
- Do not expose hidden cheat behavior in the public catalog.

Gate:

- `GET /api/services` returns one `diligence.report` group with Honest and Cheat options.
- Catalog output includes quote/trust metadata and omits `challenge_behavior` or any hidden cheat flag.
- `POST /api/route { "service_id": "diligence.report" }` returns route options that `/api/pay` can
  consume.
- `npm test` and `npm run check-types` pass.

### Phase 4 - Route-Time Quote Collection And Payment Requirements

Purpose: move payment requirement creation out of agent cards and into the router's invocation path.

- Keep seeded/manual service quotes working through existing quote templates.
- For card-backed services, use the router-owned demo quote adapter:
  - Honest Agent: quote `0.1 ALGO`, payment requirement `0.1 ALGO`.
  - Cheat Agent: quote `0.04 ALGO`, payment requirement `0.06 ALGO`.
- Create `ActiveQuote` and `PaymentRequirement` during `/api/route`, not during card ingestion.
- Let `/api/services` show router-derived quote snapshots without mutating active quote state.
- Keep hidden Cheat drift out of public catalog output.

Gate:

- `/api/route` creates active quotes and payment requirements for card-backed Honest/Cheat agents.
- `/api/pay` settles against the payment requirement, so Cheat still settles above the active quote.
- `/api/validate` still catches the quote drift.
- `npm test` and `npm run check-types` pass.

### Phase 5 - End-To-End Verification And Handoff

Purpose: prove the slice works as a demo surface and leave the shared docs current.

- Run the non-spending checks first: `npm test` and `npm run check-types`.
- If TestNet payer funds are available, carefully smoke the live flow:
  - `GET /api/services`;
  - `POST /api/route { "service_id": "diligence.report", "task": "..." }`;
  - `POST /api/pay { route_id, option_id }`;
  - `POST /api/validate { payment_id }`.
- Verify Honest still settles at quote and Cheat still settles above quote in the existing demo.
- Update `INTEGRATION_HANDOFF.md` with new endpoint signatures, card URLs, registry ids, and blockers.
- Update the Phase Validation Log programmatically after the gate status is known.

Gate:

- `npm test` passes.
- `npm run check-types` passes.
- Live smoke evidence is recorded, or skipped with the exact reason.
- `/api/pay` and `/api/validate` behavior remains intact.
- `INTEGRATION_HANDOFF.md` is current.

### Phase Validation Log

Update this log after each phase before advancing.

| Phase | Status | Validation evidence | Notes |
|---|---|---|---|
| Phase 0 - Baseline, Hosting, And Registration Decision | PASS | Must-read docs read; TestNet app ids confirmed in `docs/status/DEPLOYED.md`; canonical raw GitHub URL shape recorded above. | Registration path: backend-signed `register` then generated `setAgentWallet(uint256,address)void`; no TestNet-spending command run. |
| Phase 1 - Card Shape, Fixtures, And Parser | PASS | `docs/agents/testnet/{honest-agent,cheat-agent}.json`; `agents.ts::parseAgentCard`; `npm test` pass. | Parser requires ARC-8004 `type`, active card, MCP, `algorand-wallet`, `x402Support:true`; public cards no longer include `trust_router`. |
| Phase 2 - Resolver And Local Ingestion | PASS | `agents.ts::resolveCardsFromManifest` + `resolveDefaultTestnetCards` + `ingestAgentCardsFromManifest`; tests cover success, manifest-404 direct URL fallback, failure fallback, disabled fallback, idempotency. | Successful card ingestion replaces seeded `diligence.report`; card-backed services store endpoint facts only. |
| Phase 3 - MCP Proxy Catalog And Route Compatibility | PASS | `GET /api/services`; tests cover grouped catalog, router-derived quote/trust metadata, no hidden challenge fields, route-by-service compatibility. | Trust Router owns the `diligence.report` proxy mapping; partner cards provide MCP endpoint + wallet only. |
| Phase 4 - Route-Time Quote Collection And Payment Requirements | PASS | `agents.ts::quoteForService`; `/api/route` tests cover Honest `0.1` and Cheat `0.04` quoted / `0.06` requested. | `ActiveQuote` includes `observed_at` and `expires_at`; Cheat drift remains a router-owned demo adapter override. |
| Phase 5 - End-To-End Verification And Handoff | PASS | `npm test` pass; `npm run check-types` pass; `INTEGRATION_HANDOFF.md` updated. | Live smoke skipped because `npm start` spends TestNet funds; TestNet registration remains env-gated. |

## Implementation Entry Points

- `apps/router/src/contract.ts`
  - Add catalog/card types only if they become shared wire shapes.
- `apps/router/src/agents.ts`
  - Card parsing, ingestion, service grouping, catalog construction.
- `apps/router/src/routes.agents.ts`
  - Add `GET /api/services`.
  - Keep `/api/agents` and `/api/route` behavior compatible.
- `apps/router/src/identity-onchain.ts`
  - Reuse existing TestNet registration helper.
- `apps/router/src/seed.ts`
  - Keep as fallback/demo source. Do not delete unless the whole boot path is updated.
- `apps/router/src/agents.test.ts`
  - Add focused tests for card parsing, catalog grouping, and route compatibility.

## Acceptance Criteria

- Two agents exist as named Honest/Cheat service cards.
- Both agents have stable TestNet wallets.
- Both agent registration files set `x402Support: true`.
- Honest/Cheat agent cards do not include `trust_router`, router service ids, or quote fields.
- Both agents are registered on TestNet IdentityRegistry, or this file records the registration blocker.
- Router can ingest both cards into `ctx.agents` and `ctx.services` using identity, wallet, and MCP
  endpoint facts only.
- `GET /api/services` returns one `diligence.report` group with two options.
- When card ingestion succeeds, those two options are the card-backed Honest/Cheat agents, not seeded
  duplicates.
- Each option includes agent identity, agent URI, wallet, capability endpoint, router-derived quote, and
  reputation snapshot.
- Public catalog does not expose hidden cheat behavior.
- `/api/route` creates active quotes and payment requirements at route time.
- Existing `/api/pay` and `/api/validate` demo flow remains intact.
- `POST /api/route { "service_id": "diligence.report" }` still works.
- `npm test` and `npm run check-types` pass.

## TestNet And App ID Policy

- TestNet is the default network in `apps/router/src/context.ts`.
- Identity registration is env-gated:
  - `IDENTITY_APP_ID=764031067`
  - `IDENTITY_SUBMITTER_MNEMONIC=<funded private TestNet mnemonic>`
- The shared payer is public throwaway TestNet only. Never reuse it on MainNet.
- Do not redeploy registry contracts for this slice. Registering Honest/Cheat agents is an app call
  into the existing IdentityRegistry, not a new contract deployment.
- Current TestNet app ids should stay:
  - IdentityRegistry: `764031067`
  - ReputationRegistry: `764031363`
  - ValidationRegistry: `764031094`
- If contract source changed but was not redeployed, TestNet still runs the old deployed bytecode.
- If contract source must be redeployed with the current scripts, expect new app ids because deploy
  config uses `onUpdate: "append"` and `onSchemaBreak: "append"`.
- If new app ids are produced, immediately update `docs/status/DEPLOYED.md`,
  `apps/web/deployed.testnet.json`, `.env` / `.env.example` references, and `INTEGRATION_HANDOFF.md`.

## Minimal ARC-8004 Agent URI Shape

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Honest Agent",
  "description": "Diligence agent for contradictory business signals.",
  "services": [
    {
      "name": "MCP",
      "endpoint": "https://honest-agent.example.com/mcp",
      "version": "2025-06-18"
    },
    {
      "name": "algorand-wallet",
      "endpoint": "J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY"
    }
  ],
  "x402Support": true,
  "active": true,
  "registrations": [
    {
      "agentId": "REGISTRY_AGENT_ID_ONCE_KNOWN",
      "agentRegistry": "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe:764031067"
    }
  ],
  "supportedTrust": ["reputation", "validation"]
}
```

Notes:

- `type` should follow the ARC-8004 reference shape. Do not use a project-local agent schema.
- Do not add `$schema` yet unless we publish a real JSON Schema document. The ERC-8004 URL is the
  registration-file `type` discriminator, not a JSON Schema URL.
- `services[]` stays ARC-8004-shaped. The router reads `MCP` for capability endpoint and
  `algorand-wallet` for the receiving wallet.
- Do not put `trust_router`, router service ids, proxy metadata, or quote fields in public agent cards.
- The router maps eligible MCP endpoints into the grouped `diligence.report` proxy catalog.
- Route-time quote/payment requirements are router-derived for this demo slice.
- Honest Agent wallet: `J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY`.
- Cheat Agent wallet: `3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ`.
- Challenge/proof fields are intentionally not part of the required card shape yet.
- If a hosted agent already exposes `/x402/challenge`, do not depend on it in this slice.

## Grouped Catalog Shape

```json
{
  "network": "testnet",
  "generated_at": "2026-06-07T00:00:00.000Z",
  "services": [
    {
      "service_id": "diligence.report",
      "name": "Diligence report",
      "description": "Compare contradictory business signals and produce a concise diligence read.",
      "proxy": {
        "route_endpoint": "POST /api/route",
        "route_body": {
          "service_id": "diligence.report",
          "task": "string"
        }
      },
      "options": [
        {
          "option_key": "algorand:testnet:AGENT...::diligence.report",
          "agent_id": "algorand:testnet:AGENT...",
          "registry_agent_id": "1",
          "agent": {
            "name": "Honest Agent",
            "agent_uri": "https://honest-agent.example.com/agent.json",
            "agent_wallet": "ALGOTESTNETADDRESS..."
          },
          "capability": {
            "source": "agent_uri",
            "protocol": "MCP",
            "endpoint": "https://honest-agent.example.com/mcp",
            "name": "Diligence report",
            "description": "Compare contradictory business signals and produce a concise diligence read."
          },
          "quote": {
            "amount": 0.1,
            "asset": "ALGO",
            "pay_to": "ALGOTESTNETADDRESS..."
          },
          "trust": {
            "reputation": 50,
            "reads_logged": 0,
            "corrections_logged": 0
          }
        }
      ]
    }
  ]
}
```

Do not include `challenge_behavior` in the public catalog. The cheat is revealed only in a later
challenge/payment slice. Quote snapshots in this catalog are router-derived, not card-authored.

## Deferred Later Slices

- `/api/challenge`
- No-custody x402 payment
- Real partner-agent x402 quote/challenge endpoints
- Payment proof capture and verification
- Quote vs challenge vs proof validation
- `POST /api/feedback`
- Frontend consumption of `/api/services`
- Full ARC-8004 chain scan
- MCP tool-list parsing
- A2A agent-card adapter
- Semantic service clustering
- Production persistence and TTLs
