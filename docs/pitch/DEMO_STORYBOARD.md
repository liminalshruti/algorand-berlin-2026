# Demo Storyboard — Liminal · x402 Trust Router (≤3 min)

The **voiceover you record and play aloud while the demo runs**, timed to the **actual UI** — a
multi-page console with a left **sidebar** (Trust Router · Marketplace · Agent Studio · Contracts ·
Admin). Target ~2:50. Enterprise anchor: an organization's agents buying work from *other orgs'*
vendor agents. The one beat that must land: **caught cheating → automatic validation drops reputation
(anchored) → re-run reroutes to the honest vendor.**

**Pre-flight**
- Start the server: `npm start` (defaults to **TestNet** — real public-network txids; fund the shared payer first, see `INTEGRATION_HANDOFF.md`). Then serve `apps/web/` statically and open `router.html`.
- Check the **chain-context badge** (bottom-right): `ALGORAND · TESTNET` + the registry app-ids. Check the source indicator reads **● server online** (live). If the server's down, the UI falls back to mock automatically — the loop is identical; say "running on mock" only if asked.
- Press `P` for **present mode**; zoom so text is legible from the back. The **sidebar** is your navigation.
- Keyboard: `R` route · `A` approve · `P` present.
- *(Confirm on-screen vendor names — Vega / Borealis — against `apps/router/src/seed.ts`.)*

---

## BEAT 0 — Set the frame (0:00–0:12)
- **Screen:** **Trust Router** page (sidebar item active). Empty state, scenario chips visible. Bottom-right badge `ALGORAND · TESTNET`.
- **VO:** "This is Liminal — a trust router for organizations whose agents buy work from other agents, on Algorand. An operator puts a job to the market; vendors bid. Watch what happens when one of them lies. Everything settles on TestNet — bottom-right."

## BEAT 1 — Rank (0:12–0:38)
- **Action:** Click the **▶ Routing-mismatch read** scenario chip (or `R`). Vendor agents populate in the left rail, ranked.
- **Point at:** the loop spine on **Rank**; **Vega (cheapest) is #1**; the selected vendor's **trust breakdown** (price / reputation / validation).
- **VO:** "Your org needs a diligence read on a contradiction — the email says rejected, the dashboard says in-review. Three vendor agents bid. We don't rank on price alone — price **plus earned reputation plus validation**, one score. Cheapest is Vega, and it leads. It hasn't been caught yet."

## BEAT 2 — Pay & the catch (0:38–1:05)
- **Action:** Click **Approve & pay** (or `A`). Pending → metric band fills.
- **Point at:** **Quote vs Challenge** — x402 charge **higher, in red**; the **x402 payment-anchored** badge + proof-of-payment (round, nonce); spine on **Pay**.
- **VO:** "The operator approves. Vega advertised the cheapest quote — but the x402 charge comes back higher. Your org just got overcharged. Payment settles on Algorand TestNet, and the drift is caught from payment proof — not a complaint form."

## BEAT 3 — Automatic validation → reputation drops, anchored (1:05–1:32)
- **Action:** (validation runs automatically) — the causal line + signed packet appear.
- **Point at:** the **causal line** "Reputation 88 → 78 **because** charge > active quote — quote_drift"; the **signed packet** (verdict, reputation delta, SHA-256); the **ledger** row in the audit ribbon.
- **VO:** "Automatic validation writes the verdict: Vega's reputation **drops**, *because* the charge exceeded the quote it committed to — anchored hash-only on Algorand. Here's the signed packet, here's the anchor. Not an opinion. Payment evidence."
- *(Optional 3s):* **⚑ Flag vendor** → "the operator can file a dispute too."

## BEAT 4 — Re-run → self-correction (1:32–1:58) ★ THE MONEY BEAT
- **Action:** Click **↻ Re-run request**.
- **Point at:** the **FLIP animation** — Vega **slides down**, tagged **caught**; **Borealis now leads**; reroute banner; spine on **Re-run**.
- **VO:** "Now the payoff. Same job, run again. Vega falls; the router **reroutes to the honest vendor**. No human edited a list — the chain caught the cheat and the next decision changed. That's earned reputation."

## BEAT 5 — The substrate: ERC-8004 on Algorand (1:58–2:30)
- **Action:** In the **sidebar**, click **Marketplace** → pick a vendor → click its **score pill** ("see the transactions"). Then in the sidebar click **Contracts**.
- **Point at:** the **"transactions behind this score"** modal — every review tied to an **x402 proof-of-payment** (verified: only the payer can review, one review per proof). Then on **Contracts**, the **deployed registry app-ids** (Identity / Reputation / Validation) + the callable ABI.
- **VO:** "Behind the router is an ERC-8004-shaped registry on Algorand. A trust score here is **% of verified buyers satisfied** — click it and every review traces to an x402 payment you can audit, not a number a vendor typed. And these are real, deployed contracts: Identity, Reputation, Validation — here are the app-ids and the full ABI."

## BEAT 6 — Verifiability (2:30–2:42)
- **Action:** Back on the router (sidebar → **Trust Router**), click a **ledger anchor** → detail modal → **TestNet explorer** link. Click a hash to **copy**.
- **Point at:** the bottom-right **chain badge** (TestNet + app-ids); hash-only note; explorer link.
- **VO:** "Everything's anchored hash-only on Algorand's note field — verifiable by anyone, exposing nothing. One ledger: who paid whom, quote versus charge, and the verdict."

## CLOSE (2:42–2:55)
- **Screen:** Trust Router, reroute still visible (or title slide).
- **VO:** "Earned, chain-verified trust — the first primitive of Liminal's control plane for the agent economy. ERC-8004 gives agents a passport. **We give the marketplace a conscience.**"

---

## Two "trust scores" — say it once so it reads as intentional
- **Router pick score** (Trust Router page): `0.3·price + 0.4·reputation + 0.3·validation` — how the router *chooses* this time.
- **Registry earned score** (Marketplace): `% of verified buyers satisfied` — the durable, payment-anchored reputation the router *reads*.
One line in Beat 5 ("the router's pick score reads the registry's earned score") keeps a sharp judge from seeing two numbers as inconsistent.

## Honesty (criterion 7 — precision, not apology)
- **Live on TestNet:** x402 settlement + hash-only ledger anchoring (real txids; explorer links resolve to `lora.algokit.io/testnet`).
- **Deployed + cross-linked on TestNet (done, not a milestone):** the three ARC-8004 registries — Identity `764031067`, Reputation `764031363` (x402-coupled feedback), Validation `764031094`; code-hash verifiable (`docs/status/DEPLOYED.md`).
- **Proven on TestNet (audit trail):** a full register → pay → review → validate trail across three independent wallets — `audit/LATEST.md`; every txid resolves on the explorer.
- **Proof path wired (router):** `/api/challenge → /api/payment-proof → /api/feedback` verify a real confirmed payment and write ValidationRegistry + `giveFeedback` (env-gated, hash-anchor fallback). The **on-stage UI** drives the router-settled shim and anchors hash-only — say "anchored," not "computed on-chain"; surfacing the proof path in the UI is the final wire-up.
- ERC-8004-**shaped**, Algorand-native; "validated reputation" = active quote vs x402 charge + future attestations — not a general oracle.

## Video production notes (≤3-min recording)
- 1920×1080, present mode, cursor visible, ~110% zoom. Navigate via the **sidebar**.
- Capture the **FLIP reroute** (Beat 4) cleanly — the thumbnail moment; 1.5s hold + subtle zoom.
- Keep the **chain badge** (TestNet + app-ids) and the **source indicator** in frame at least once.
- Lower-third captions per beat: Rank / Pay / Catch / Verdict / Re-route / Registry. End card: tagline + repo URL + "Algorand · Infrastructure track".

## Fallback ladder
1. **Server down / payer unfunded** → UI auto-falls back to mock; indicator shows it. Proceed; the loop is identical.
2. **Network flaky on-site** → run the pre-recorded video (this storyboard).
3. **Projector/contrast** → present mode + zoom handle it.

## Timing cheat sheet
| beat | t | what the audience must see |
|---|---|---|
| 1 | 0:12 | ranked by trust, not price |
| 2 | 0:38 | charge > active quote, in red |
| 3 | 1:05 | reputation drops, anchored |
| 4 | 1:32 | **re-run reroutes — self-correction** |
| 5 | 1:58 | reviews audit to a payment · real registry app-ids |
| 6 | 2:30 | hash-only, verifiable on TestNet |
