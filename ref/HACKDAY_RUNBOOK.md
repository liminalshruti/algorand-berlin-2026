# Hack-day runbook — Algorand Builders Berlin (Jun 6–7)

One page that stitches deploy + demo into a checklist. **Spine** = this entry (`provenance/`:
provenance + correction loop, runs on LocalNet today). **Companion** = `liminal-agents` x402 wiring
(merged to `main`: x402 core, priced `/api/read`, Algorand facilitator, reputation registry).

## Pre-hack (Jun 3–5)
- [x] LocalNet up: `algokit localnet start` (or export the active Colima/Docker socket, then `algokit localnet status`). Verified 2026-06-01 via Colima socket.
- [x] **Spine dry-run:** `cd provenance && LIMINAL_ALGO_NETWORK=localnet npm run demo:loop:localnet` — drop→read→correct→sign, real txids. Verified 2026-06-01.
- [x] **Companion on-chain proof:** `cd liminal-agents/sandbox && node bin/x402-localnet-proof.js` — settle + reputation anchor, real txids. Verified 2026-06-01.
- [ ] **Companion server (Docker):** `docker build -t liminal-x402 liminal-agents/sandbox && docker run --env-file .env -p 3000:3000 liminal-x402` (builds the native deps the laptop sandbox couldn't).
- [ ] **Fund testnet wallets** through the AlgoKit/Lora TestNet dispenser — distinct addresses per agent + the payer. This requires a dispenser login/API token; the old bank endpoint now redirects to Lora. Set `.env` (`X402_MODE=algorand`, `X402_ALGO_NETWORK=testnet`, `AGENT_<KEY>_WALLET`, `LIMINAL_ALGO_MNEMONIC`, `ANTHROPIC_API_KEY`). See `liminal-agents/sandbox/DEPLOY_X402.md`. Current provenance account `QMN37XAIZPHBO5MB6GRHRMC6QBINJ4WOGQCUBZKPAXB4OSP2NTRGU6LE2U` is unfunded.
- [ ] **Testnet dry-run:** spine `npm run demo:loop:testnet` + the companion priced flow (`/api/read/priced` → `/api/read/settle`). Blocked until wallets are funded.

## Sat Jun 6 — Day 1
- [ ] Submit the existing-project entry early (spine repo).
- [ ] Run end-to-end on testnet: the spine loop + a companion priced read.
- [ ] Walk the four beats (see `DEMO_SCENARIO.md`).
- [ ] Find judges; start conversations.

## Sun Jun 7 — Day 2
- [ ] 5-min pitch with the one-pager as substrate.
- [ ] Submit final; capture contacts.

## The 60-second demo (judge-facing)
1. **Priced read over x402** → 402 → settle on Algorand → delivered read **anchored** (real txid). Aside: ask out-of-lane → **FREE refusal**, names the right peer, no charge.
2. **Operator corrects** (`outer`); an `emergence` correction stays **local**.
3. **Re-read hash changes** → the loop doesn't converge (agents never read prior corrections).
4. **Reputation entry** (score from how reads survive correction) **anchored hash-only** on Algorand; full report stays off-chain.

## Honesty (criterion 7 — do not overclaim)
ERC-8004 "names the registries," not "is the standard." Layer-2 is positioning. The live demo's
taxonomy is the **4** `correction_kind` (liminal-agents adds the **9-tag** `CORRECTION_TAGS`). Describe
PPA **behavior**, not claim language. Full notes: `DEMO_SCENARIO.md`.

## Fallback (if testnet/deploy slips)
Run everything on **LocalNet** — real txids, zero funding. The spine loop and the companion proof both
run on LocalNet today, so the demo holds even if the public deploy isn't ready. (Per `TODO_PRE_BERLIN.md`:
Sean bandwidth is the load-bearing constraint; LocalNet is the safe demo.)
