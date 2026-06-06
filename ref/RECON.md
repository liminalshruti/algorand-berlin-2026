# Algorand Berlin Hackathon — Recon & Submission Angle

**For:** Shruti + Shayaun
**Date:** 2026-05-20
**Event:** Algorand Builders Berlin Hackathon, June 6–7 2026, 42 Berlin
**Adjacent target:** DARPA DICE Proposers Day, May 29 2026
**Stream files:** `recon/01-luma-ecosystem.md`, `recon/02-darpa-dice.md`, `recon/03-repo-fit-audit.md`

---

## TL;DR

1. **Hackathon dates are June 6–7, 2026 (not April).** Recon stream 1 hallucinated April dates; verified directly against luma.com/agentic-commerce-hack: **June 6th 9:00 am – June 7th 21:00 pm** at **42 Berlin, Harzer Str. 42**. ~17 days away.
2. **There are TWO tracks, not one.** *Agentic Commerce* ($12,500) AND **Infrastructure ($7,500)**. The infra track explicitly accepts "Existing projects" with a $3,000 first prize. **This is where Liminal fits.**
3. **The "contested-environment heterogeneous agent coordination" pitch is a strong fit for DARPA DICE and a stretched fit for Algorand.** Susmit Jha (DICE PM) is verified, May 29 Proposers Day is the higher-leverage window for that framing.
4. **For Algorand, the better angle is the Infrastructure track with `liminal-agents` (12 bounded agents + correction stream + structural refusal) reframed as agentic-commerce-infrastructure-primitives.** Shayaun's prior Algorand experience + existing substrate makes this a 17-day "harden + integrate x402 settlement" sprint, not a net-new build.
5. **Recommended posture: pursue both, sequenced.** DICE Proposers Day May 29 (whitepaper + Jha relationship), Algorand Berlin June 6–7 (infrastructure track submission with `liminal-agents` + x402 settlement layer). They reinforce each other — DICE legitimizes the architectural claim; Algorand demonstrates the commerce-adjacent application.

---

## What's confirmed vs what's still open

### Confirmed
- **Event:** Algorand Builders Berlin, June 6–7 2026, 42 Berlin (Harzer Str. 42, 12059 Berlin) — verified luma.com/agentic-commerce-hack
- **Hosts:** 42 Berlin Blockchain & friends, 0xMihej, AI Agents Berlin, Algorand Foundation
- **Prize pool:** $20,000 USDC total, 50/50 distribution (half immediate, half on milestone completion)
- **Tracks:**
  - Agentic Commerce ($12,500) — new projects: 1st $3K / 2nd $2K / 3rd $1.5K; existing: 1st $4K / 2nd $2K
  - **Infrastructure ($7,500)** — new projects: 1st $2.5K / 2nd $2K; existing: 1st $3K
- **Pre-hackathon workshop:** June 3 at 6:00 PM CEST (optional but probably high-leverage for clarifying judge expectations)
- **Registration:** Approval required, no public deadline stated
- **Format constraint:** "Existing projects" is explicitly an accepted category — you do not need to ship net-new

### Still open
- Named judges (luma page does not list them publicly)
- Whether "Infrastructure" track has a stated scope beyond payments-adjacent infra (i.e., does coordination-substrate qualify?)
- Submission deliverable format (live demo only? code repo + writeup? on-mainnet PoC required?)
- Team size limits
- Whether prior Algorand experience (Shayaun) buys any structural advantage with judges

**Action:** Apply for the June 3 workshop slot. That's the canonical venue to ask the organizers directly.

---

## DARPA DICE — the parallel target

**Verified facts (stream 2):**
- **DICE = "Decentralized Artificial Intelligence through Controlled Emergence"** (not "Decentralized Intelligence for Contested Environments" — Shruti's working hypothesis was close but wrong on the name)
- **Sponsoring office:** DARPA I2O
- **Program manager:** **Susmit Jha** (not Suman) — prior SRI research scientist 2015–2025, formal verification + autonomy in contested environments + decentralized multi-agent systems
- **Proposers Day:** **May 29, 2026** — 9 days away
- **Budget range:** $500K–$3M per award; direct DICE BAA $800K–$1.5M, 60–90 day window post-Proposers Day
- **Small business eligible:** Yes. SBIR Phase I fast track ($250K / 6mo) also available.

**Architectural alignment (from stream 3 audit):** Four core Liminal capabilities map directly:
- **Structural guard** (`liminal-natsec/server/src/specialists/guard.ts`) → DICE local inference control
- **Bayesian fusion + Kalman filtering + provenance** (`liminal-natsec/shared/scoring/*`) → DICE decentralized coordination primitives
- **Review-memory rule DSL** (`liminal-natsec/app/src/lib/reviewRulesStore.ts`) → DICE doctrine-maintenance / steerability
- **Bounded refusal across 12 agents** (`liminal-agents`) → DICE heterogeneous coordination + resilience to compromise

Plus: **`liminal-desktop/crates/` — 22-crate Rust workspace ("Liminal Spine") with DDD bounded contexts, seven-layer publication guard, NatSec mode** — directly credible substrate for a Proposers Day technical claim.

**Recommendation: do not skip May 29.** This is the higher-strategic-value window of the two events. Whitepaper + Proposers Day attendance + one Jha conversation buys a 12-month relationship runway that no hackathon prize will match.

---

## Algorand submission angle — refined

### The pivot
Shruti's original framing — "heterogeneous AI agents in contested environments with local inference control to keep each agent aligned with commander's intent and resilient to compromise / rogue agents" — is DARPA-shaped, not commerce-shaped. Submitting that framing to the **Agentic Commerce** track would feel forced and would not place.

But the **Infrastructure track** is a different conversation. The same substrate, reframed:

> **Liminal Agents Infrastructure for Agentic Commerce:**
> *Bounded refusal, doctrine maintenance, and correction-stream primitives for agent-to-agent commerce on Algorand. When agents transact, structural guards prevent commerce-rogue behavior; review-memory rules persist operator corrections as durable doctrine; correction streams audit-trail every transaction with full provenance.*

This framing:
- Uses **existing substrate** (12 bounded agents, refusal-as-output, correction stream — all shipped, all tested, hackathon-validated)
- **Wedges onto x402** as the settlement layer (agents call other agents; calls are payment-gated; refusals are still free)
- Takes the **"existing projects" category** for $3K first-place infra prize
- Honors Shayaun's prior Algorand experience (he writes the x402 integration; you ship the substrate)
- **Does NOT require building DARPA-grade defense substrate into the hack** — that's a separate track for Proposers Day

### What's net-new for the hack

From the repo audit, the existing Liminal substrate has **zero blockchain integration**. So the net-new work is:

1. **x402 settlement layer wired into `liminal-agents` `/api/read` and `/api/refine`** (~3-5 days Shayaun) — each agent register has a per-call x402 price; refusals are zero-cost; corrections are operator-paid; provenance gets a transaction hash.
2. **Algorand mainnet/testnet deployment** of the agent service with a public x402-enabled endpoint (~1-2 days)
3. **A demo scenario** that shows agent-to-agent commerce with structural guard refusing a bad transaction and an operator's review rule preventing recurrence (~2 days)
4. **Submission collateral** — repo writeup, one-pager, ~3min demo video (~1-2 days Shruti)

**Total:** 7–10 working days. Inside the 17-day window even with DICE May 29 sandwiched in.

### What's NOT recommended

- **Building a full Algorand-native rewrite of `liminal-natsec`.** Too much net-new, too little leverage on existing substrate, and the natsec demo is wrong-shaped for a commerce judge anyway.
- **Submitting `liminal-desktop` Spine to the hack.** The Spine is the right substrate for DICE/Proposers Day. For a hackathon judge, it would read as "interesting but unfinished" — the May 12 README says the tray loop "does not call this HTTP surface."
- **Submitting to the Agentic Commerce track instead of Infrastructure.** Commerce track judges will want clean payment flows + UX. Infrastructure track judges will reward substrate quality + composability — which is where Liminal wins.

---

## Sequencing (next 17 days)

| Date | Action | Owner |
|---|---|---|
| 2026-05-20 (today) | Accept luma invite. Apply for June 3 workshop slot. Email organizers asking infra-track scope question. | Shruti |
| 2026-05-21 → 05-28 | DICE whitepaper draft (4 primitives → DICE objectives mapping). Polish `liminal-natsec` demo for Proposers Day live walkthrough. | Shruti (whitepaper), Shayaun (Byzantine-injection scenario in natsec — see stream 3 §6) |
| **2026-05-29** | **DARPA DICE Proposers Day** | Both |
| 2026-05-30 → 06-02 | Shayaun: x402 integration into `liminal-agents` `/api/read` + `/api/refine`. Shruti: hack submission collateral (one-pager, demo script, repo polish). | Both |
| 2026-06-03 | Algorand pre-hackathon workshop (6 PM CEST). Use to confirm track scope and meet judges/organizers. | Both if in Berlin; one of you remote if not |
| 2026-06-04 → 06-05 | Algorand testnet deployment + demo scenario build. Buffer day. | Shayaun primary, Shruti pair |
| **2026-06-06 → 06-07** | **Hackathon.** Submission to Infrastructure track. | Both |

**Travel decision:** Berlin June 3–8 covers workshop + hack + a buffer day. Flights from SF are 11–14 hours. Time-zone arbitrage favors arriving June 3 to acclimate before workshop. Decide by May 23 (booking window).

---

## What the founder's framing got right and wrong

> "coordination of heterogeneous AI agents in contested environments with local inference control to keep each agent aligned with commander's intent and resilient to compromise / rogue agents."

**Right:**
- The architectural pattern is real and you have the substrate (natsec guard + bayes + kalman + provenance + agents bounded refusal + review-memory DSL).
- Susmit Jha's research line genuinely matches (formal verification, trustworthy/steerable gen AI, controllable multi-agent, adversarial robustness — all confirmed in his publication record per stream 2).
- The Hormuz scenario is a runnable contested-environment sim — verified in code.

**Wrong / needs adjustment:**
- "DICE" expands to **Decentralized Artificial Intelligence through Controlled Emergence**, not "Decentralized Intelligence for Contested Environments." The "contested environments" framing IS in Jha's research but is NOT the DICE acronym.
- This framing is **too defense-shaped for the Algorand commerce hack.** Don't pitch commander's-intent to commerce judges.
- "Coordination of heterogeneous agents" is **stronger in `liminal-agents` (12 agents × 4 registers) than in `liminal-natsec` (single domain, multiple specialists wrapped in one guard).** For DICE pitch, lead with agents-as-heterogeneity and natsec-as-contested-env; don't conflate.

---

## Open questions to resolve in the next 48 hours

1. **Travel commit:** Berlin June 3–8 or not? Need by May 23 for cheap flights.
2. **Workshop attendance:** Both apply? Just Shayaun? Cap of 1 per team?
3. **DICE whitepaper format:** Is DARPA expecting a formal whitepaper before May 29, or is Proposers Day a listen-only event? Stream 2 should be re-checked on this — recon noted "60–90 day window post-Proposers Day" for BAA response, which implies Proposers Day itself is informational.
4. **liminal-agents licensing:** If you submit to the hack with an x402 integration layer, is the submission MIT/Apache (Algorand standard) or do you keep IP closed? Existing `liminal-agents/LICENSE` and `liminal-agents/PATENT_CLAIMS.md` should be cross-checked.
5. **Coordination with Shayaun's bandwidth:** Stream 3 estimates 7–10 days net-new Shayaun-time for the Algorand wire-up, plus DICE substrate hardening. Realistic given his 0.25 FTE current commitment?

---

## Strategic read

This is two complementary high-leverage windows in a 9-day stretch:
- **May 29 DICE Proposers Day** = government/research relationship-building with verified PM-substrate match. Whitepaper outcome.
- **June 6-7 Algorand Berlin** = ecosystem/commerce ecosystem positioning with infrastructure-track existing-project entry. Prize + Algorand Foundation visibility + Berlin network outcome.

The risk of doing both is splitting Shayaun's attention. The risk of doing only one is leaving the other on the table when the substrate already supports it.

**Recommended:** Both, sequenced cleanly. DICE first (substrate already shipped; whitepaper is writing-not-building). Algorand second (infrastructure track + existing project = lowest-risk path to a $3K placement on a hackathon that puts you in the Algorand Foundation's "agentic commerce native" cohort).

**Hard stop:** If by May 25 the x402 integration scope feels >10 days of Shayaun-time, drop Algorand and put 100% on DICE. The DARPA pathway is the longer-leverage bet, and Berlin will run another hack in Q3 or Q4.

---

## Sources

- Primary luma: https://luma.com/agentic-commerce-hack
- Detailed per-stream: `recon/01-luma-ecosystem.md` (note: contains April-2026 date error — corrected here to June 6-7)
- Detailed DICE: `recon/02-darpa-dice.md`
- Detailed repo audit: `recon/03-repo-fit-audit.md`
- Verified luma fetch this session 2026-05-20 (June 6-7, 42 Berlin, two tracks)
