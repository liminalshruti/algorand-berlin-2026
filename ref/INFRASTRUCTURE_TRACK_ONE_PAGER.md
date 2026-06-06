# Liminal × x402 × Algorand — Infrastructure track submission

**Event:** Algorand Builders Berlin: Agentic Commerce x402 Hackathon · Jun 6-7, 2026 · 42 Berlin
**Track:** Infrastructure ($7,500 pool · existing-project 1st = $3,000)
**Team:** Shruti Rajagopal (founder · liminal-agents architecture) + Shayaun Nejad (engineering · Algorand integration)
**Repo:** https://github.com/liminalshruti/liminal-agents (public, MIT-licensed, 83 tests, hackathon-tested)
**Status:** DRAFT — internal positioning artifact; not for external release without Shruti ratification + counsel review

---

## The one-paragraph claim

ERC-8004 names the **registries** an open agent economy needs (identity, reputation, validation). x402 names the **settlement** rail. Neither specifies what agents must internally enforce so the entries are *earned, not gamed*. Liminal's four shipped substrate primitives — bounded refusal, correction stream, privacy-invariant blackboard, chain-anchor pattern — are exactly that missing substrate layer. **For Berlin, we ship the substrate-layer integration: bounded agents calling each other over x402 on Algorand, where refusals are zero-cost first-class outputs, corrections become typed events anchored to Algorand note fields, and ERC-8004 reputation entries point to Liminal correction-stream URIs as their off-chain detail.**

---

## What we're building (net-new for the hack)

| Component | Effort | Owner |
|---|---|---|
| x402 settlement layer wired into `liminal-agents` `/api/read` + `/api/refine` (per-call price; refusals zero-cost; corrections operator-paid; provenance includes txn hash) | 3-5d | Sean |
| Algorand testnet/mainnet deployment with public x402-enabled endpoint | 1-2d | Sean |
| ERC-8004 reputation registry entry pattern: bounded score on-chain → Liminal correction-stream URI off-chain → KECCAK-256 integrity hash | 1d | Sean |
| Demo scenario: agent-A makes a claim → agent-B challenges via correction → correction lands on Liminal substrate → reputation registry updates → anchor lands on Algorand | 2d | Both |
| Submission collateral: repo writeup, judge-facing pitch, ~3min demo video | 1-2d | Shruti |

**Total:** ~7-10 working days — but the **hackathon itself (Jun 6-7) is the primary build window**, not the ~3 days to departure (Jun 2). Pre-hack runway (Sean ~1 day Sat 5/30 + Jun 4-5) covers the **x402 wiring only** (3-5d, per `X402_INTEGRATION_SCOPING.md`); the reputation-registry pattern + testnet deploy land during the hack. The provenance + correction-loop slice already runs on Algorand LocalNet today, so the demo spine is de-risked regardless.

---

## What's already shipped (existing-project legitimacy)

Per `liminal-agents/PATENT_CLAIMS.md` + 83-test suite:

- **PPA #4 — Bounded Agent Refusal:** 12 specialist agents across 4 registers (Diligence, Outreach, Judgment, Operations). Each declares domain + anti-domain mapped to topology (clock geometry, DAG geometry). Refusal is a first-class output, not error fallback. Out-of-topology routing fails as `geometry_violation` with discriminator.
- **PPA #5 — Correction Stream:** Closed 9-tag taxonomy. Immutable typed events alongside agent reads. Agents NEVER read prior corrections — the *record* compounds, not the model.
- **Hackathon validated:** Won "most original architectural idea" at AgentHansa AI Agent Economy Hackathon (Apr 2026).

---

## The 4-layer stack (for judges)

```
┌────────────────────────────────────────────────────┐
│  LAYER 4: x402 Settlement                          │
│  Coinbase Foundation → Linux Foundation            │
│  HTTP 402 + stablecoin authorization               │
└────────────────────────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────┐
│  LAYER 3: ERC-8004 Agent Registries                │
│  Identity · Reputation · Validation                │
└────────────────────────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────┐
│  LAYER 2: Liminal Substrate Discipline ← THE GAP   │
│  Bounded refusal · correction stream ·             │
│  privacy invariance · selective chain-anchor       │
└────────────────────────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────┐
│  LAYER 1: Algorand                                 │
│  Atomic transaction grouping ·                     │
│  low cost · deterministic finality · 1KB note      │
└────────────────────────────────────────────────────┘
```

**Layer 2 is the gap.** ERC-8004 (Layer 3) assumes Layer 2 exists but does not specify it. x402 (Layer 4) assumes the agent calling the protocol is trustworthy enough to pay, but does not specify how that trust is built. Liminal's substrate primitives are the missing Layer 2.

---

## Why this fits Infrastructure track (not Agentic Commerce)

Infrastructure track values: **substrate quality + composability**, not payment UX.

- **Substrate quality:** 12 shipped agents, 83 tests, 9-tag correction taxonomy frozen at schema layer, topology-derived peer allowlists at module-load. Not a hackathon-week prototype.
- **Composability:** Liminal correction-stream URIs are exactly the off-chain detail ERC-8004 reputation entries are designed to reference. Natural composition with the public standard.
- **Existing-project category fit:** This isn't "we'll build agents during the hack." It's "12 agents are already shipped with refusal-as-output; we're wiring them to x402 + Algorand registries."

We are NOT submitting to Agentic Commerce track because that track rewards clean payment flows + UX, and we'd burn substrate quality on UX polish.

---

## What's defensibly novel vs ERC-8004 reputation pattern

ERC-8004 reputation and Liminal correction stream are doing structurally similar work. We're being honest about this. The defensible novelty:

1. **Closed taxonomy vs open tags.** ERC-8004 allows free-form tags. Liminal's 9-tag correction taxonomy is frozen at schema layer; extending it bumps `schema_version`. Difference between "feedback you can sort by" and "feedback that participates in a typed substrate."
2. **Disagreement-preservation invariant.** ERC-8004 reputation is *aggregable* (bounded scores accumulate). Liminal's invariant is opposite: agents never read corrections. The record compounds, the agents stay bounded. Liminal agents *cannot drift toward median user opinion* — a property ERC-8004 has no opinion on.
3. **Counter-cyclical to AI capability.** ERC-8004 reputation gets more accurate as more agents interact (network effect on the registry). Liminal's correction stream gets more *interesting* as model capability improves (better models → sharper reads → richer disagreements → deeper record). Different feedback loops, different moat shapes.

---

## Honesty register (Criterion 7 self-check)

- **ERC-8004 adoption status:** spec is Aug 2025; production-dominance is in flight, not present. We say "ERC-8004 names the registries the agent economy needs" — naming is canonical; adoption is in flight.
- **Liminal substrate on-chain status:** PPA #4 and #5 are shipped in `liminal-agents`. Chain-anchor pattern is *decided* (decision 2026-05-21) but *not yet implemented*. The hack itself is the natural integration moment.
- **Layer 2 framing:** positioning claim, not yet deployed reality. We say "substrate primitives are shipped; on-chain integration is what we're building this hack to demonstrate."
- **PPA #10 status:** RATIFIED but pre-filing. Privacy-invariant blackboard discussed *architecturally* in public; specific claim language stays private until filing.
- **Two correction taxonomies (avoid judge confusion):** `liminal-agents` ships the closed **9-tag** `CORRECTION_TAGS` (`wrong_frame`, `off_by_layer`, …). The runnable LocalNet demo exercises the **4** `correction_kind` emission categories (inner/outer/cross/emergence) from the provenance/notion correction stream. Both are real, different axes — a judge running the demo sees 4, not 9; they reconcile when x402 wires into `liminal-agents`.

---

## What we're asking judges to evaluate

1. **Substrate quality of the existing primitives** (read the repo, run the tests, examine the refusal-routing logic in `src/topology/`).
2. **Architectural fit between Liminal substrate and ERC-8004 + x402** (per the 4-layer stack — does Liminal's bounded-refusal + correction-stream actually compose with the registry pattern? We claim yes; the demo proves it).
3. **Composability with the broader Algorand agent ecosystem** (GoPlausible facilitator, AI Agents Berlin community, future ERC-8004 implementations on Algorand).
4. **Existing-project category fit** ($3,000 1st prize) — we're not submitting hackathon-week prototype work; we're submitting an x402-integration layer on a tested substrate.

---

## Pitch sentence (audience-routed)

| Audience | One-sentence pitch |
|---|---|
| Algorand Foundation judges | "We're not building another commerce app; we're building the substrate discipline that makes the agent economy on x402 + ERC-8004 trustworthy enough for institutional adoption." |
| GoPlausible / facilitator team | "Our correction-stream URIs are exactly the off-chain detail ERC-8004 reputation entries are designed to point at — and we already anchor to Algorand note fields." |
| 0xMihej / AI Agents Berlin | "The agentic economy needs more than payment rails. It needs agent-internal discipline. We're the substrate layer the registries assume exists." |

---

## Cross-references

- `algorand-berlin-2026/RECON.md` — full event recon + submission angle
- `algorand-berlin-2026/REGISTRATION.md` — submitted form + pre-event todos
- `algorand-berlin-2026/ERC8004_LIMINAL_CROSSWALK.md` — 4-primitive vocabulary map (full substrate)
- `liminal-agents/PATENT_CLAIMS.md` — PPA #4, #5, #6 candidate
- `founder-brain/decisions/2026-05-21-chain-anchor-pattern.md` — Pattern 3 Algorand anchor

---

## Provenance

- **Drafted:** 2026-05-29 evening, pre-Berlin substrate sprint
- **Status:** DRAFT — needs Shruti ratification + Sean architecture review on Sat 5/30 + counsel review before any public surface
- **Distribution:** internal only until ratified; subset (stack diagram + Layer 2 framing) authorized for hack pitch post-ratification
