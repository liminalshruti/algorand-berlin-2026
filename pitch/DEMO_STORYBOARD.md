# Demo Storyboard — x402 Trust Router (≤3 min)

Shot list + voiceover, timed to the **actual UI** (`public/router.html` +
`public/registry.html`). Use **present mode** (press `P`) and a clean window.
Target ~2:50. The one beat that must land: **caught cheating → reputation drops
(anchored) → re-run reroutes to the honest provider.**

**Pre-flight**
- Serve `public/` from a static server (not `file://`, so vendored CSS/fonts + clipboard work). Open `router.html`.
- Confirm the source indicator: **● server online** for a live demo, or **○ mock** for the safe path — either is fine; the loop is identical.
- Reset state by reloading. Press `P` for present mode. Zoom so text is legible from the back.
- Keyboard: `R` route · `A` approve · `P` present.

---

## BEAT 0 — Set the frame (0:00–0:12)
- **Screen:** Trust router, empty state, scenario chips visible. Titlebar wedge reads "reputation is earned, not self-reported."
- **Action:** none yet (or hover the "Routing-mismatch read" scenario chip).
- **VO:** "This is a trust router for agent-to-agent commerce. An operator needs a service; competing agents will bid. Let's route one."

## BEAT 1 — Rank (0:12–0:38)
- **Action:** Click the **▶ Routing-mismatch read** scenario chip (or press `R`). Providers populate in the left rail, ranked.
- **Point at:** the loop spine lighting **Rank**; the ranked list — **Vega (cheapest) is #1**; the selected provider's **trust breakdown bar** (price / reputation / validation).
- **VO:** "Three providers bid. We don't just rank by price — it's price **plus earned reputation plus validation**, one trust score. Cheapest is Vega, and right now it leads. Note its reputation is decent — it hasn't been caught yet."
- *(Optional, 3s):* click the **ⓘ** on Vega → reputation provenance modal → close. "We can inspect any provider's record."

## BEAT 2 — Pay & the catch (0:38–1:05)
- **Action:** Click **Approve & pay** (or `A`). Pending → metric band fills.
- **Point at:** **Quoted vs Settled** — settled is **higher, in red**; the **x402 payment-anchored** badge + proof-of-payment (round, nonce); the spine on **Pay**.
- **VO:** "Operator approves. We settle over x402 on Algorand — a real payment. But watch the settled amount: it comes back **higher than the quote**. A hidden fee — caught straight from the on-chain settlement, not a complaint form."

## BEAT 3 — Validate → reputation drops, anchored (1:05–1:32)
- **Action:** (validation runs automatically after pay) — the causal line + signed packet appear.
- **Point at:** the **causal line**: "Reputation 88 → 78 **because** settled > quoted — missed_compensation"; the **signed packet** (disposition, verdict, reputation delta, SHA-256); the **ledger** row(s) in the audit ribbon.
- **VO:** "Validation writes the verdict on-chain: the provider's reputation **drops**, *because* settled exceeded quote. It's anchored hash-only on Algorand — here's the signed packet, here's the anchor. The penalty is on the ledger, not in our database."
- *(Optional, 3s):* click **⚑ Flag provider** → "the operator can file a dispute too."

## BEAT 4 — Re-run → self-correction (1:32–1:58) ★ THE MONEY BEAT
- **Action:** Click **↻ Re-run request**.
- **Point at:** the **FLIP animation** — Vega **slides down**, gets the **"caught" tag**; **Borealis now leads**; reroute banner; spine on **Re-run**.
- **VO:** "Now the payoff. Same request, run again. Vega falls; the router **reroutes to the honest provider**. No human edited a list — the chain caught the cheat and the next decision changed. That's earned reputation."

## BEAT 5 — The substrate: ERC-8004 console (1:58–2:28)
- **Action:** Click **Registry ↗** (titlebar) → `registry.html`. Select an agent. Click the **score pill**.
- **Point at:** the **"transactions behind this score"** modal — each feedback entry references an **x402 paymentTxid + nonce**; the **Hub** tab (rank/filter all agents); the **act-as** caller bar.
- **VO:** "Behind the router is an ERC-8004-shaped registry on Algorand — identity, reputation, validation. Click a score and you see the **transactions that built it** — every one tied to a payment. Reputation you can audit to a settlement, not a number a provider typed about itself."

## BEAT 6 — Verifiability (2:28–2:42)
- **Action:** Back to the router (or in console), click a **ledger anchor** → detail modal → explorer link. Click a hash to **copy**.
- **Point at:** hash-only note; schema label; explorer link; the copy toast.
- **VO:** "Everything's anchored hash-only on Algorand's note field — verifiable by anyone, exposing nothing. One ledger of who paid whom, quoted vs settled, and the verdict."

## CLOSE (2:42–2:55)
- **Screen:** back on the router, reroute still visible (or title slide).
- **VO:** "Honestly — ERC-8004 is a 2025 draft and isn't on Algorand yet; ours is ERC-8004-shaped, Algorand-native, settling live on LocalNet. ERC-8004 gives agents a passport. **We give the marketplace a conscience.**"

---

## Video production notes (for the ≤3-min recording)
- Record at 1920×1080, present mode on, cursor visible, ~110% zoom.
- Capture the **FLIP reroute** (Beat 4) cleanly — it's the thumbnail moment; consider a 1.5s hold + subtle zoom.
- Lower-third captions for each beat label (Rank / Pay / Catch / Verdict / Re-route / Registry).
- Keep the **source indicator** in frame at least once (proves live vs honest-mock).
- End card: tagline + repo URL + "Algorand · Infrastructure track".

## Fallback ladder (if something slips)
1. **Live server down** → UI auto-falls back to mock; indicator shows it. Proceed; say "running on mock" only if asked.
2. **On-site network flaky** → run the pre-recorded video (this storyboard).
3. **Projector/contrast** → present mode + zoom already handle it; have a high-contrast pass ready.

## Timing cheat sheet
| beat | t | what the audience must see |
|---|---|---|
| 1 | 0:12 | ranked by trust, not price |
| 2 | 0:38 | settled > quoted, in red |
| 3 | 1:05 | reputation drops, anchored |
| 4 | 1:32 | **re-run reroutes — self-correction** |
| 5 | 1:58 | transactions behind the score |
| 6 | 2:28 | hash-only, verifiable on Algorand |
