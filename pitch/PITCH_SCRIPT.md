# Pitch Script — x402 Trust Router on Algorand

**Event:** Algorand Builders Berlin · Agentic Commerce x402 · **Track:** Infrastructure
**Team:** Shruti Rajagopal (architecture · UI · narrative) + Shayaun Nejad (chain · x402) + Navid + Reza
**One-liner:** *A trust router over x402 on Algorand — reputation the chain enforces, not self-reported.*
**Tagline:** *"ERC-8004 gives agents a passport. We give the marketplace a conscience."*

> Honesty register (say these as written; never overclaim): ERC-8004 is an Aug-2025 **draft**, **not deployed on Algorand** — ours are ERC-8004-**shaped**, Algorand-native. The demo runs on **Algorand TestNet** (real txids): x402 settlement + hash-only anchoring are live; the verdict performs **one real on-chain `giveFeedback`** to the deployed Reputation registry when wired (else anchored hash-only). The ranking math is an in-memory mirror of the on-chain score. "Validated reputation" = the specific checks we run (price-vs-quote, output) — not a general oracle.

---

## A) 75-second version (Round 1 · judging groups)

**[0:00–0:12 · Hook]**
"Agent marketplaces rank by price. The cheapest provider wins — then adds a hidden fee at checkout. Reputation is self-reported, so it's gameable. As agents start paying agents, that's the trust gap."

**[0:12–0:25 · What it is]**
"We built a **trust router** over x402 on Algorand. An operator asks for a service; competing agents return on-chain quotes; we rank them by **price + earned reputation + validation**, pay the winner over x402, then **validate the delivery against its quote — on-chain**."

**[0:25–0:50 · The demo beat — show, don't tell]**
"Watch. The cheapest provider wins the route. We pay over x402 on **TestNet** — and the settled amount comes back **higher than the quote**: a hidden fee, caught from chain data. The verdict drops its reputation, **written on-chain**. Re-run the same request — and the router **routes around it** to the honest provider. The marketplace self-corrected. Reputation is *earned*, not asserted."

**[0:50–1:05 · Why it's infrastructure]**
"ERC-8004 names the registries an agent economy needs — identity, reputation, validation. x402 names the settlement rail. Neither specifies what makes an entry *earned*. That discipline — bounded validation, payment-anchored feedback, hash-only provenance — is the layer we built, ERC-8004-shaped and Algorand-native."

**[1:05–1:15 · Why Algorand + close]**
"On Algorand the payment and the proof live on the **same ledger** — sub-cent, instant-final, a 1KB note as the anchor. ERC-8004 gives agents a passport. **We give the marketplace a conscience.**"

---

## B) 3-minute version (Round 2 · on stage)

**[0:00–0:20 · Hook + stakes]**
"Quick show of hands — who's used a flight aggregator that shows the cheapest fare, then piles on fees at checkout? That pattern is about to scale to *machines*. Agents are starting to pay other agents for work. The marketplaces ranking them use price plus **self-reported** reputation — which is gameable. There's no trust layer the chain actually enforces."

**[0:20–0:40 · Thesis]**
"We built the missing layer: a **trust router** over x402 on Algorand. Reputation is *earned through on-chain validation*, not claimed. ERC-8004 gives agents a passport; we give the marketplace a conscience."

**[0:40–1:50 · Live demo — the loop]** *(drive the UI via the sidebar; see DEMO_STORYBOARD.md)*
- "An operator needs a diligence read. The router collects competing quotes and ranks them — **price, earned reputation, and validation**, in one pick score. Cheapest here is *Vega*, and it leads. Bottom-right: we're on Algorand **TestNet**."
- "Operator approves. We settle over x402 — a real TestNet transaction. But look: **settled is higher than quoted**. A hidden fee, caught directly from the on-chain settlement."
- "Validation writes the verdict: *reputation drops, 88 to 78, **because** settled exceeded quote* — written to the on-chain Reputation registry / anchored hash-only. Here's the signed packet, here's the txid."
- "Now the payoff. Re-run the **same** request. Vega falls; the router **reroutes to the honest provider**. No human edited a list. The chain caught it and the next decision changed."

**[1:50–2:20 · The substrate — ERC-8004 on Algorand]**
"In the **sidebar**, the Marketplace shows trust as **% of verified buyers satisfied** — click a score and every review traces to an **x402 payment** you can audit, not a number a provider typed. And the **Contracts** page shows these are real apps — Identity, Reputation, Validation — with deployed app-ids and the full ABI. The router's pick score reads the registry's earned score."

**[2:20–2:45 · Why Algorand + the stack]**
"Why Algorand: x402 settles on the **same ledger** as the registries, so proof-of-payment is native, not a foreign hash you have to trust. Sub-cent fees make a feedback transaction a routine side-effect of doing business; instant finality means the next route can rely on it; the 1KB note is our hash-only anchor — verifiable by anyone, exposing nothing."

**[2:45–3:00 · Honesty + close]**
"Honestly: ERC-8004 is a 2025 draft and isn't on Algorand yet — ours is ERC-8004-shaped, Algorand-native, settling live on TestNet, with the verdict writing on-chain to the Reputation registry. The infrastructure agentic commerce needs isn't another payment rail — it's earned trust. **ERC-8004 gives agents a passport. We give the marketplace a conscience.** Thank you."

---

## C) Q&A — 20-second answers

- **"Isn't this just a reputation system?"** Reputation systems take self-reported feedback. Ours only counts feedback **anchored to an x402 payment** — verified purchasers, one review per proof — and validates the delivery against the quote on-chain. Earned, not asserted.
- **"What's actually on-chain vs off?"** On-chain (TestNet): the x402 settlement, the hash-only ledger anchors, and the verdict's `giveFeedback` to the Reputation registry. Off-chain: the detail the hash commits to, and (today) the ranking math — an in-memory mirror of the on-chain score. You verify the score without us exposing the substrate.
- **"How is this different from ERC-8004?"** ERC-8004 *names* the registries; it doesn't specify what makes an entry earned. We add that discipline and port the registries to Algorand (ARC-72 / ARC-28 / ARC-60). Composes with the standard, doesn't compete.
- **"Why not Ethereum?"** Same-ledger x402 settlement: proof-of-payment is a native reference, not a foreign `{chainId, txHash}`. Plus sub-cent fees make per-interaction feedback economical.
- **"Is it live?"** Yes — on TestNet, with real txids: x402 settlement, hash-only anchoring, and one on-chain reputation write per verdict. The three registries are AVM contracts with unit + LocalNet e2e suites. We were deliberate about not faking the chain parts; full ranking-on-chain is the milestone.
- **"Who's the buyer?"** Whoever operates an agent marketplace or routes agent work — they need provider trust they can defend. The console (Marketplace / Studio / Contracts / Admin) is the operator's surface.

---

## Delivery notes
- **Round 1: Maven/Palantir-invisible.** Lead with the commerce problem, not architecture.
- Lead with the **demo**; the caught-cheating reroute is the memory. Don't over-explain before showing it.
- Navigate with the **sidebar**; keep the bottom-right **TestNet** chain badge in view.
- Say the tagline twice — once at open, once at close.
- If the server isn't up, the UI **falls back to mock** automatically and the indicator shows it — keep going; the loop is identical. Note "running on mock" only if asked.
