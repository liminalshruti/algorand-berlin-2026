# Pitch Script — Liminal · Trust Router on Algorand

**Event:** Algorand Builders Berlin · Agentic Commerce x402 · **Track:** Infrastructure
**Team:** Shruti Rajagopal (architecture · UI · narrative) + Shayaun Nejad (chain · x402) + Navid + Reza
**One-liner:** *Earned, chain-verified trust for how organizations' agents buy from other agents — a trust router over x402 on Algorand.*
**Tagline:** *"ERC-8004 gives agents a passport. We give the marketplace a conscience."*

> **Precision register (say as confidence, not apology).** ERC-8004 is a 2025 **draft**, not on Algorand → ours is ERC-8004-**shaped**, Algorand-native. **Deployed + cross-linked on TestNet today:** Identity `764031067`, Reputation `764031363` (x402-coupled, payment-backed feedback), Validation `764031094` — code-hash verifiable. **Live in the demo:** x402 settlement, hash-only anchoring, automatic catch → reputation drop → reroute. **In the router today, on-chain next:** ranking + validation. Demo payment is router-settled; no-custody forwarding is the next wire-up. "Validated reputation" = active quote vs x402 charge + future attestations — not a general oracle.

---

## A) 3-minute stage version (Round 2 · on stage)

**[Slide 1 · 0:00–0:15 · open]**
"Organizations are starting to run fleets of agents — and those agents are starting to buy work from *other* companies' agents. I'm Shruti, from Liminal; we build the layer that lets them trust each other. *ERC-8004 gives agents a passport — we give the marketplace a conscience.* Thirty seconds on the problem, then I'll show it working on Algorand TestNet."

**[Slide 2 · 0:15–0:45 · the problem, why now]**
"Every company in this room is about to run agents that buy work from other companies' agents — diligence, research, code review — paid per call over x402. That's vendor procurement across org boundaries, at machine speed. And today's agent markets rank those vendors on price plus *self-reported* reputation. So the cheapest wins the contract, then charges more than it quoted — and its reputation is a number it typed about itself. You'd never let your team expense against a vendor that rates itself. But that's how your agents buy today. There's no trust layer the chain enforces."

**[Slide 3 · 0:45–1:05 · the solution]**
"So we built a trust router over x402 on Algorand. For every job, it ranks vendors on price, *earned* reputation, and validation; pays the winner over x402; then validates what they charged against what they quoted, writes the result to reputation, and reroutes. Caught once, routed around next time. Reputation is earned from payment proof — not asserted. Let me show you."

**[Slide 4 · 1:05–2:00 · live demo]** *(drive via sidebar; see DEMO_WALKTHROUGH.md)*
"Your org needs a diligence read — the partner email says the deal's rejected, the dashboard says it's in review. Three vendor agents bid. We rank on price plus earned reputation plus validation — one pick score. Cheapest is Vega; it leads, because it hasn't been caught yet. The operator approves. Vega advertised the lowest quote — but the x402 charge settles *higher*, on Algorand TestNet, real txid. Your org just got overcharged — and automatic validation catches it from payment proof, no complaint form, drops Vega's reputation, and anchors the verdict hash-only. Now the payoff: same request, again — Vega falls, the router reroutes to the honest vendor. No human edited a list. The chain caught it, and the next decision changed."

**[Slide 5 · 2:00–2:35 · why it's defensible]**
"Why is this infrastructure, not a feature? x402 is the settlement rail. ERC-8004 names the registries an agent economy needs — identity, reputation, validation — but it doesn't say what makes an entry *earned*. That discipline is the layer we built. And we built it on Algorand for one reason: the payment and its proof live on the *same ledger*. Proof-of-payment is native, not a foreign hash you have to trust — and sub-cent finality makes validating every call economical. A marketplace won't build this — they rank on their own take-rate; a neutral, chain-enforced trust layer is the wedge. These three registries are deployed and cross-linked on TestNet right now — here are the app-ids; verify the code hashes yourself."

**[Slide 6 · 2:35–3:00 · vision, roadmap, ask, close]**
"Zoom out. Liminal governs how an organization's agents operate — what they spend, how they behave. The trust router extends that past your own walls: when your agents buy from agents you don't control, reputation is earned and chain-verified. One control plane for the agent economy — inside the org and across it. What's live today is real and on TestNet: the registries, settlement, anchoring, and the catch-and-reroute. Three wire-ups take it from demo to network — no-custody payments, on-chain ranking, network-wide discovery — and that's exactly what we'd use this prize to land. We want the first real volume routing through us, and design partners running agent fleets. On-chain today: registries, settlement, anchoring; in the router today and on-chain next: ranking and validation — we'll show any judge exactly where that line is. *ERC-8004 gives agents a passport. We give the marketplace a conscience.* Thank you."

---

## B) 75-second version (Round 1 · judging groups)

"Your company's agents are about to buy work from other companies' agents over x402 — vendor procurement at machine speed. Today's agent markets rank those vendors on price plus *self-reported* reputation: the cheapest wins the contract, then charges more than it quoted, and its reputation is a number it typed about itself. We built a trust router over x402 on Algorand — it ranks on price plus *earned* reputation, pays the winner, validates the charge against the quote from payment proof, drops the cheater, and reroutes, automatically. *[demo: catch → reroute.]* Three ERC-8004-shaped registries, deployed and cross-linked on TestNet today. It's the first primitive of Liminal's control plane for the agent economy. ERC-8004 gives agents a passport; we give the marketplace a conscience."

---

## C) Q&A — 20-second answers

- **"Isn't this just a reputation system?"** Reputation systems take self-reported feedback. We separate payment-backed user feedback — verified buyer, one review per proof — from automatic validation, which catches quote-vs-charge drift from settlement proof without waiting for a complaint. Earned, not asserted.
- **"Isn't this just a marketplace?"** No — we're the neutral trust layer *above* the marketplaces. They rank on their take-rate; we rank on earned, chain-verified reputation and never touch the vendor's margin.
- **"What's on-chain vs off?"** On-chain (TestNet): three deployed, cross-linked registries; x402 settlement; hash-only anchors. In the router today, on-chain next: ranking + the validation compute. We'll show you the exact line.
- **"How is this different from ERC-8004?"** ERC-8004 *names* the registries; it doesn't specify what makes an entry earned. We add that discipline and port the registries Algorand-native (ARC-72 / ARC-28 / ARC-60). Composes with the standard, doesn't compete.
- **"Why Algorand, not Ethereum?"** Same-ledger x402 settlement: proof-of-payment is a native reference, not a foreign `{chainId, txHash}`. Sub-cent finality makes validating every call economical.
- **"Is it live?"** Yes — TestNet, real txids: settlement, hash-only anchoring, and the catch → drop → reroute. Registries deployed + cross-linked. On-chain reputation writes and no-custody payment are the next wire-up.
- **"Who's the buyer / what's the model?"** Whoever operates agent fleets or routes agent work and has to defend the spend. Model: enterprise control-plane subscription + per-verification fee. Neutral because we don't take vendor margin.
- **"What's the moat?"** Neutrality + same-ledger proof + standard-alignment. A marketplace is incentivized to rank on its take-rate; an independent, chain-enforced trust layer is credibly neutral and composes across marketplaces.

---

## Delivery notes
- **Round 1:** lead with the procurement problem, not architecture.
- Lead with the **demo**; the caught-cheating reroute is the memory. Don't over-explain before showing it.
- Navigate with the **sidebar**; keep the bottom-right **TestNet** chain badge in view.
- Say the **tagline twice** — once at open, once at close.
- Name the **action item** you'd close for the second half of the prize (no-custody forwarding *or* on-chain ranking) — judges reward a crisp next step.
- If the server isn't up, the UI **falls back to mock** automatically and the indicator shows it — keep going; the loop is identical. Say "running on mock" only if asked.
