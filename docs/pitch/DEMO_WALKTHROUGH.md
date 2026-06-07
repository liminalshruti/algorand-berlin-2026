# Demo Walkthrough Map — Liminal · x402 Trust Router

For **driving the demo live on stage** (distinct from the recorded VO in `DEMO_STORYBOARD.md`).
One action per row, one line of speech, what must be on screen, and recovery. Enterprise anchor:
an organization's agents procuring work from *other orgs'* vendor agents.

**Pre-flight (2 min before):** `npm start` (TestNet; payer funded) → serve `apps/web/` → open `router.html`
→ press `P` (present mode) → confirm bottom-right badge `ALGORAND · TESTNET` and source indicator `● server online`.
**Keyboard:** `R` route · `A` approve · `P` present.

| # | You do | You say (live) | Must be visible | If it breaks |
|---|---|---|---|---|
| 0 | Open **Trust Router**, present mode (`P`) | "An org's agents buying from other agents — on Algorand TestNet, bottom-right." | `ALGORAND · TESTNET` badge | Badge missing → reload; don't mention it |
| 1 | Click **▶ Routing-mismatch read** (`R`) | "Three vendors bid. We rank price + earned reputation + validation. Cheapest, Vega, leads." | Ranked rail; spine on **Rank**; Vega #1 | Mock fallback is identical — keep going |
| 2 | **Approve & pay** (`A`) | "Cheapest quote — but the x402 charge settles higher. The org got overcharged. Real TestNet txid." | Quote-vs-Challenge band, **red** challenge; proof badge | If txid slow, narrate the quote/challenge gap until it lands |
| 3 | (validation auto-runs) | "Reputation drops *because* charge > quote. Anchored hash-only." | Causal line `88→78`; signed packet; ledger row | If packet doesn't render, click the ledger pill to show the anchor |
| 4 | Click **↻ Re-run** | "Same job — reroutes to the honest vendor. The chain self-corrected." | **FLIP**: Vega down/`caught`, Borealis leads | THE beat — pause 2s, let it land before talking |
| 5 | Sidebar → **Marketplace** → score pill; → **Contracts** | "Every review traces to a payment. And these registries are deployed — app-ids, ABI." | Reviews-by-proof modal; deployed app-ids | If a page is mock, say "registry view" and move on |
| 6 | Sidebar → **Trust Router** → ledger anchor → explorer | "Hash-only, verifiable by anyone on TestNet." | `lora.algokit.io/testnet` link resolves | If offline, show the app-id in the badge instead |

## Presenter rules
- **Lead with the catch-and-reroute** (beats 1–4) — it's the memory you leave. Don't over-explain before showing it.
- Navigate only via the **sidebar**; keep the **TestNet badge** in frame.
- **Say the tagline twice** — open and close.
- If asked **"on-chain or off?"**: *"Registries, settlement, anchoring — on-chain on TestNet. Ranking and validation compute in the router and anchor hash-only — that's the next wire-up."* Precision wins Criterion 7.
- If asked **"isn't this just a marketplace?"**: *"No — we're the neutral trust layer above the marketplaces. They rank on their take-rate; we rank on earned, chain-verified reputation."*
- Server down → UI auto-falls back to mock, loop is identical — say "running on mock" only if asked.

## Fallback ladder
1. Server down / payer unfunded → mock fallback (indicator shows it). Proceed; loop is identical.
2. Network flaky → play the pre-recorded video (`DEMO_STORYBOARD.md`).
3. Projector/contrast → present mode (`P`) + zoom.
