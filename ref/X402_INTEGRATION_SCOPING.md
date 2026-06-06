# x402 → liminal-agents — integration scoping (2026-05-30)

Scoping for the Berlin pre-hack sprint (Jun 4–5): wire this repo's x402 settlement slice
(`provenance/src/x402/`) into `liminal-agents` so agent reads are priced and out-of-lane work is
refused for free. Read-only scoping — no `liminal-agents` code changed yet.

## API layer (liminal-agents)
- **Framework:** Hono. Routes on one `app` in `sandbox/bin/server-app.js`; entry `sandbox/bin/server.js`. No auth / rate-limit middleware today.
- **`POST /api/read`** (`server-app.js:96`) → `runReading()` runs all 12 agents in parallel (`lib/orchestrator.js:113`). First run 30–180s; cached ~120ms.
- **`POST /api/refine`** (`server-app.js:220`) → `refineAgentRead()` re-runs ONE agent with a correction as extra context (`lib/refine.js:25`). ~2–5s. **This is already the correction-stream surface.**

## Agent model + the gap
- 12 agents × 4 registers in `sandbox/lib/agents/index.js:22` (Diligence / Outreach / Judgment / Operations). Each is `{name, key, register, domain, system, tools?}`; refusal is first-class (`REFUSE: <Agent> · <boundary>`, validated in `lib/validation.js`).
- **Missing for x402:** `payTo`, `price`, `asset` (and optional `archetype`). Add via a thin `PricedAgent` overlay (env-driven wallets) — do NOT edit the core registry.

## Integration design (wrapper over existing handlers)
The provenance `PricedEndpoint` flow maps directly onto a two-roundtrip HTTP shape:
1. **Lane guard first** — `checkLane(agent, task.register)`: out-of-lane → `200` free refusal naming the right agent (no charge). Mirrors `x402/gate.ts` step 1 + the agents' existing refusal contract.
2. **In-lane, unpaid** → `402 PAYMENT-REQUIRED` with `PaymentRequirements` (nonce-bound to `read:<agent>:<task>`).
3. **In-lane, paid** (`POST /api/read/settle`) → `facilitator.verify()` → `settle()` (Mock or Algorand) → run the agent → return the read; optionally anchor the delivered packet (provenance, hash-only).
- New isolated modules under `liminal-agents/sandbox/lib/x402/`: `agent-pricing.js`, `lane-guard.js`, `challenge.js`, `facilitator-adapter.js` (vendors this repo's `x402/facilitator.ts`). Touch `server-app.js` only at the two endpoints; the legacy unpriced `/api/read` stays as a fallback.

## Friction / unknowns
- `/api/read` is synchronous (all 12 agents); the priced flow is per-agent + two-roundtrip → needs a small client helper (request → 402 → sign → retry).
- Agents have no wallets today: env-var wallets for the demo; **distinct funded wallets for a real submission** (not the demo's self-pay — see `TODO_PORT_AUDIT_2026-05-30.md`).
- Pending-challenge state is in-memory (fine for the demo; TTL / DB for production).
- 83 existing tests use a mocked Anthropic client; add ~15 x402 tests using the Mock facilitator/payer already in this repo.

## Day-count (1 engineer, ~6h/day)
| Day | Work |
|---|---|
| 1 | `agent-pricing` + `lane-guard` + `challenge` modules |
| 2 | `facilitator-adapter`; split `/api/read` (challenge + settle); gate `/api/refine` |
| 3 | tests (lane, challenge, replay, paid-read end-to-end on Mock) |
| 4 | client helper, docs, optional provenance anchor |
| 5 | LocalNet / testnet wallets + demo script |

**Estimate: 5 days full · 3 days compressed** (Mock-only, no anchor, critical-path tests) — within the one-pager's 3–5d allowance. The **lane guard is the load-bearing piece** (free refusal keeps commerce from breaking the bounded-refusal contract); settlement is the priced add-on.

## Source map
- liminal-agents: `sandbox/bin/server-app.js`, `sandbox/lib/agents/index.js`, `sandbox/lib/orchestrator.js`, `sandbox/lib/refine.js`
- this repo: `provenance/src/x402/{gate,facilitator,agent,types}.ts`
