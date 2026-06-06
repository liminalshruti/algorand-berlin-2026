# Demo scenario — Berlin Infrastructure track (run-of-show)

**Internal demo-prep** (Sean + Shruti). Judge-facing subset = the run-of-show beats + the Layer-2
stack diagram; PPA claim language stays internal (see honesty notes). Grounded in code that runs
today: `provenance/bin/loop-demo.ts`, verified on Algorand **LocalNet** with real txids.

## The story (one sentence)
A bounded agent sells a priced read over x402; the operator disagrees; the correction is recorded as
first-class data and the corrected read is re-anchored on Algorand — agent reputation becomes a
function of how its reads survive correction, not how confidently it asserts.

## Live today vs. hackathon-day build (be honest about the seam)
- **LIVE (runs now, this repo, real txids on LocalNet):** x402 settlement · structural lane-guard
  (free out-of-lane refusal) · correction stream (4 kinds; emergence stays local) · hash-only
  provenance anchoring · per-call audit log. → `LIMINAL_ALGO_NETWORK=localnet npm run demo:loop:localnet`.
- **HACKATHON-DAY build (Jun 6–7):** the ERC-8004-shaped **reputation registry** (Beat 4) + wiring
  x402 into liminal-agents' real `/api/read` (per `X402_INTEGRATION_SCOPING.md`). Today the loop runs
  against the provenance-repo agents, not the 12 liminal-agents yet.
- **SUBMISSION SPINE DECISION (2026-05-30):** the judged runnable spine is this repo,
  `hackathons/algorand-berlin-2026`; `liminal-agents#40` is the product-integration companion until
  its real-network endpoint path is verified.

## The four beats — mapped to what actually runs

**Beat 1 — A bounded agent makes a priced claim.**
- Drop a contested decision: "partner email says rejected; the dashboard says in-review."
- Analyst (Diligence) is in-lane → `402 PAYMENT-REQUIRED` → client signs → facilitator **settles on
  Algorand** → serves the read → delivered packet **anchored hash-only**.
- Judge sees: real settle txid + anchor txid, `provenance verify: OK`. *(loop-demo beat: READ)*
- Guard aside (commerce guard): ask the Analyst to do Outreach → `200 FREE — refuses, route to SDR`,
  no charge. ERC-8004 identity vs. refusal: *an agent card is a claim; bounded refusal is the structural commitment.*

**Beat 2 — The operator challenges via a correction (not a retry).**
- "It's a routing-mismatch, not a rejection — the dashboard is source of truth."
- Recorded as a `correction`, `correction_kind = outer`, pointing at the anchored read's event id.
  First-class typed data, not an overwrite, not an error.
- Show an `emergence` correction → `projectable = false`: the highest-value third the system did not
  offer stays **local**, never projected across a boundary (by category, not content filter).

**Beat 3 — The correction lands on the Liminal substrate.**
- The correction is an event in the append-only vault log; the corrected re-read carries it and is
  re-signed → its hash **differs** from the first read's. The loop does not converge — agents never
  read prior corrections; the record compounds, not the model.
- Judge sees: `read 1 hash … → re-read hash …` (changed) + the audit ribbon (saved/anchored/agent.call/correction/refusal counts).

**Beat 4 — Reputation + anchor land on Algorand.**
- LIVE: the corrected re-read is anchored hash-only (note = `{schema, canonical_version, packet_hash}` — no content).
- HACKATHON-DAY: an **ERC-8004-shaped reputation entry** for the Analyst updates — bounded score + a
  URI pointing at this correction stream as the off-chain detail, hash-anchored on Algorand's note
  field. Reputation = how the agent's reads survive correction. *(ERC8004_LIMINAL_CROSSWALK.md, Crosswalk 2)*

## Run sheet
- Rehearse offline (instant, no Docker): `npm run demo:loop`
- Live: `algokit localnet start` → `LIMINAL_ALGO_NETWORK=localnet npm run demo:loop:localnet` (or `:testnet` with a funded account)
- The out-of-lane guard, standalone: `npm run demo:x402:localnet` (scenario B)
- Every beat exits non-zero on a failed invariant — the demo is its own smoke test.

## Judge-facing framing (authorized subset — stack diagram + Layer 2 only)
`x402 (L4 settlement)` → `ERC-8004 registries (L3 — public ledger of agent behavior)` →
**`Liminal substrate (L2 — the gap: bounded refusal + correction stream + local-only privacy)`** →
`Algorand (L1)`. ERC-8004 names the registries; it does not specify what makes an agent's behavior
worth registering. That discipline is Layer 2.

## Honesty notes (criterion 7 — do NOT overclaim to judges)
- ERC-8004 is early (Aug 2025 spec): say "names the registries the agent economy needs," not "is the standard."
- "We are Layer 2" is positioning, not deployed reality — the substrate primitives run; the on-chain reputation integration is what the hack builds.
- The correction-stream ↔ ERC-8004-reputation overlap is **real**; the novelty is the closed taxonomy + disagreement-preservation (agents don't read corrections) + counter-cyclical-to-capability loop — NOT "we invented reputation."
- Describe PPA #10 *behavior* ("vault never crosses boundaries; emergence is local-only by category"), NOT claim language. Counsel review before any public surface uses PPA phrasing.
- Implemented `correction_kind` is **4** (inner/outer/cross/emergence); the crosswalk's "9-tag" agent taxonomy reconciles when x402 wires into liminal-agents. Use the 4 in the live demo.
- `ERC8004_LIMINAL_CROSSWALK.md` is DRAFT/internal — only the stack diagram + Layer-2 framing are authorized for judges (post-Shruti ratification); the per-PPA tables stay internal.
