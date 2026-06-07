# Pitch Deck — Liminal · Trust Router on Algorand

6 slides (5 core + close). Each: **on-slide text** (terse — speak the rest) · **visual** ·
**speaker note**. Design: Liminal frontier palette (near-black bg, warm-cream text,
clarity-violet accent), Geist + Geist Mono + a serif display. Keep ≤12 words per line on screen.

**Narrative flow:** Hook → Why now → Solution → DEMO → Why it's defensible → Vision · Roadmap · Ask.
The demo is the center of gravity — everything before earns the right to show it, everything after
says why it's infrastructure. Enterprise anchor throughout: organizations whose agents buy work from
*other orgs'* agents. Tagline said twice — open and close.

---

## Slide 1 — Title
**On slide:**
- ◇ **Liminal**
- *The trust layer for the agent economy.*
- "ERC-8004 gives agents a passport. We give the marketplace a conscience."
**Visual:** wordmark on near-black; one faint line: `Live on Algorand TestNet · x402 · 3 registries deployed & cross-linked`.
**Note:** "Organizations are starting to run fleets of agents — and those agents are starting to buy work from *other* companies' agents. We build the layer that lets them trust each other. Thirty seconds on why it's needed, then a live demo on TestNet."

---

## Slide 2 — Why now + the problem
**On slide:**
- Your agents are about to **buy work from other orgs' agents** — over x402.
- Markets rank vendors by **price + self-reported reputation**.
- Cheapest wins the contract → **x402 charge exceeds the quote**.
- *You'd never let your team expense against a vendor that rates itself.*
**Visual:** a vendor ranking; #1 "cheapest" with a red `charged +50% vs quote` sticker at settlement. Caption: *cross-org agent procurement, no earned trust.*
**Note:** "Vendor procurement across org boundaries, at machine speed — millions of jobs a day, no prior relationship, no recourse. Self-reported trust is gameable, and there's no trust layer the chain enforces. That's the gap."

---

## Slide 3 — The solution (one line + loop)
**On slide:**
- A **trust router over x402 on Algorand**.
- request → **rank** (price + earned reputation + validation) → pay → **validate charge vs quote** → reroute.
- *Caught once → routed around next time.*
**Visual:** the 6-beat loop spine (Request · Rank · Pay · Validate · Reputation · Re-run) as a ring.
**Note:** "Reputation is earned from payment proof, not asserted. This is the whole product in one line — now watch it."

---

## Slide 4 — DEMO (live) ★
**On slide:**
- **LIVE DEMO**
- the caught-cheating self-correction
**Visual:** switch to the app; the FLIP reroute. (Fallback: pre-recorded clip — see `DEMO_STORYBOARD.md`.)
**Note:** Drive the loop (sidebar nav; TestNet badge bottom-right). The beat that must land: **x402 charge > active quote → automatic validation drops reputation → re-run reroutes to the honest vendor.** Then sidebar → **Marketplace** (click a score → the **transactions behind it**) and **Contracts** (deployed registry app-ids + ABI).

---

## Slide 5 — Why it's defensible infrastructure
**On slide (4-layer stack):**
```
L4  x402                  pay-per-call settlement
L3  ERC-8004 registries   identity · reputation · validation   (Algorand-native)
L2  Earned-trust       ←  the layer we built: payment proof → reputation
L1  Algorand              sub-cent · instant-final · same-ledger proof
```
- **Deployed + cross-linked on TestNet** — verify the code hashes yourself.
**Visual:** the stack, L2 in clarity-violet; three app-id chips → explorer (`764031067 / 764031363 / 764031094`).
**Note:** "x402 is the rail; ERC-8004 names the registries but not what makes an entry *earned* — that discipline is our layer. Same-ledger proof is the moat: proof-of-payment is native, not a foreign hash you have to trust. A marketplace won't build this — they rank on their own take-rate; we're the neutral layer above them. And trust is the first primitive of Liminal's larger control plane."

---

## Slide 6 — Vision · Roadmap · Ask
**On slide:**
- **The wedge is trust; the company is the control plane.**
- Govern your agents *and* the agents they buy from — inside the org and across org boundaries.
- **Live today:** registries deployed · x402 settlement · catch → drop → reroute · one review per proof.
- **Next (highest leverage):** no-custody x402 forwarding · on-chain ranking · network-wide discovery.
- **Ask:** first real routing volume · design partners · backing to land the three wire-ups.
- *ERC-8004 gives agents a passport. We give the marketplace a conscience.*
**Visual:** tagline large; the 3-step roadmap as a short arrow; small repo/QR.
**Note:** "Liminal governs how an organization's agents operate — what they spend, how they behave. The trust router extends that past your walls. What's live is real and on TestNet; three wire-ups take it from demo to network, and that's exactly what we'd use this prize to land. On-chain today: registries, settlement, anchoring; in the router today and on-chain next: ranking and validation — we'll show you exactly where that line is. Thank you."

---

## Appendix slides (Q&A only — don't present)
- **A1 · On-chain vs off-chain:** deployed registries + x402 settlement + hash-only anchors are on-chain (TestNet); ranking + validation compute in the router and anchor hash-only — the next wire-up.
- **A2 · ERC-8004 → AVM mapping:** ARC-72 identity, ARC-28 events, ARC-60 sig, box storage, native keccak256; one app id per registry, cross-linked via `initialize(idApp)`.
- **A3 · Architecture:** UI ↔ router-server (`:3001`) ↔ x402 facilitator ↔ Algorand; Identity/Reputation/Validation registries.
- **A4 · Roadmap:** no-custody x402 forwarding → on-chain ranking → network-wide discovery (MCP/A2A/ARC-8004) → active validator attestations (optional ZK).
- **A5 · Why neutral / model:** we sit *above* the marketplaces, not inside them — we don't take the vendor's margin. Revenue = enterprise control-plane subscription + per-verification fee. Neutrality is the product.
