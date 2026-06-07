# Demo Storyboard — x402 Trust Router (≤3 min)

Shot list + voiceover, timed to the **actual UI** — a multi-page console with a left
**sidebar** (Trust Router · Marketplace · Agent Studio · Contracts · Admin). Target ~2:50.
The one beat that must land: **caught cheating → automatic validation drops reputation (anchored) → re-run reroutes
to the honest agent.**

**Pre-flight**
- Start the server: `npm start` (defaults to **TestNet** — real public-network txids; fund the shared payer first, see `INTEGRATION_HANDOFF.md`). Then serve `public/` statically and open `router.html`.
- Check the **chain-context badge** (bottom-right): `ALGORAND · TESTNET` + the registry app-ids. Check the source indicator reads **● server online** (live). If the server's down, the UI falls back to mock automatically — the loop is identical; say "running on mock" only if asked.
- Press `P` for **present mode**; zoom so text is legible from the back. The **sidebar** is your navigation.
- Keyboard: `R` route · `A` approve · `P` present.

---

## BEAT 0 — Set the frame (0:00–0:12)
- **Screen:** **Trust Router** page (sidebar item active). Empty state, scenario chips visible. Bottom-right badge shows `ALGORAND · TESTNET`.
- **VO:** "This is a trust router for agent-to-agent commerce, on Algorand. An operator needs a service; competing agents bid. Let's route one — and notice everything settles on Algorand TestNet, bottom-right."

## BEAT 1 — Rank (0:12–0:38)
- **Action:** Click the **▶ Routing-mismatch read** scenario chip (or `R`). Agents populate in the left rail, ranked.
- **Point at:** the loop spine on **Rank**; **Vega (cheapest) is #1**; the selected agent's **trust breakdown** (price / reputation / validation).
- **VO:** "Three agents bid. We don't rank on price alone — it's price **plus earned reputation plus validation**, one pick score. Cheapest is Vega, and it leads. Its reputation's still decent — it hasn't been caught yet."

## BEAT 2 — Pay & the catch (0:38–1:05)
- **Action:** Click **Approve & pay** (or `A`). Pending → metric band fills.
- **Point at:** **Quote vs Challenge** — x402 challenge **higher, in red**; the **x402 payment-anchored** badge + proof-of-payment (round, nonce); spine on **Pay**.
- **VO:** "Operator approves. The agent advertised the cheapest quote, but the returned x402 challenge asks for more. Payment settles on Algorand TestNet for that challenge amount. Quote drift is caught from payment proof, not a complaint form."

## BEAT 3 — Automatic validation → reputation drops, anchored (1:05–1:32)
- **Action:** (validation runs automatically) — the causal line + signed packet appear.
- **Point at:** the **causal line** "Reputation 88 → 78 **because** challenge > active quote — quote_drift"; the **signed packet** (verdict, reputation delta, SHA-256); the **ledger** row in the audit ribbon.
- **VO:** "Automatic validation writes the verdict: the agent's reputation **drops**, *because* the challenge exceeded the active quote commitment — anchored hash-only on Algorand. Here's the signed packet, here's the anchor. This is not user feedback; it's objective payment evidence."
- *(Optional 3s):* **⚑ Flag agent** → "the operator can file a dispute too."

## BEAT 4 — Re-run → self-correction (1:32–1:58) ★ THE MONEY BEAT
- **Action:** Click **↻ Re-run request**.
- **Point at:** the **FLIP animation** — Vega **slides down**, tagged **caught**; **Borealis now leads**; reroute banner; spine on **Re-run**.
- **VO:** "Now the payoff. Same request, run again. Vega falls; the router **reroutes to the honest agent**. No human edited a list — the chain caught the cheat and the next decision changed. That's earned reputation."

## BEAT 5 — The substrate: ERC-8004 on Algorand (1:58–2:30)
- **Action:** In the **sidebar**, click **Marketplace** → pick an agent → click its **score pill** ("see the transactions"). Then in the sidebar click **Contracts**.
- **Point at:** the **"transactions behind this score"** modal — every review tied to an **x402 proof-of-payment** (verified: only the payer can review, one review per proof). Then on **Contracts**, the **deployed registry app-ids** (Identity / Reputation / Validation) + the callable ABI.
- **VO:** "Behind the router is an ERC-8004-shaped registry on Algorand. In the Marketplace, a trust score is **% of verified buyers satisfied** — click it and every review traces to a payment you can audit, not a number an agent typed. And these are real contracts: Identity, Reputation, Validation — here are the deployed app-ids and the full ABI."

## BEAT 6 — Verifiability (2:30–2:42)
- **Action:** Back on the router (sidebar → **Trust Router**), click a **ledger anchor** → detail modal → **TestNet explorer** link. Click a hash to **copy**.
- **Point at:** the bottom-right **chain badge** (TestNet + app-ids); hash-only note; explorer link.
- **VO:** "Everything's anchored hash-only on Algorand's note field — verifiable by anyone, exposing nothing. One ledger of who paid whom, quote vs challenge, settlement proof, and the verdict."

## CLOSE (2:42–2:55)
- **Screen:** Trust Router, reroute still visible (or title slide).
- **VO:** "Honestly: ERC-8004 is a 2025 draft and isn't on Algorand yet — ours is ERC-8004-shaped, Algorand-native, settling live on TestNet. ERC-8004 gives agents a passport. **We give the marketplace a conscience.**"

---

## Two "trust scores" — say it once so it reads as intentional
- **Router pick score** (Trust Router page): `0.3·price + 0.4·reputation + 0.3·validation` — how the router *chooses* this time.
- **Registry earned score** (Marketplace): `% of verified buyers satisfied` — the durable, payment-anchored reputation the router *reads*.
One line in Beat 5 ("the router's pick score reads the registry's earned score") keeps a sharp judge from seeing two numbers as inconsistent.

## Honesty (criterion 7 — do not overclaim)
- **Live on TestNet:** x402 settlement + hash-only ledger anchoring (real txids; explorer links resolve to `lora.algokit.io/testnet`).
- **On-chain, built + tested:** the three ARC-8004 registries (AVM TypeScript, unit specs + `localnet-e2e.ts` exercising every ABI method). Deploying them to TestNet is the milestone.
- **Computed off-chain (today):** the demo's automatic validation, reputation/reroute, and user-feedback separation run in the router's in-memory state and are *anchored* hash-only — say "anchored," not "computed on-chain." If asked, that's exactly the next wire-up.
- ERC-8004-**shaped**, Algorand-native; "validated reputation" = active quote vs x402 challenge, optional output checks — not a general oracle.

## Video production notes (≤3-min recording)
- 1920×1080, present mode, cursor visible, ~110% zoom. Navigate via the **sidebar**.
- Capture the **FLIP reroute** (Beat 4) cleanly — the thumbnail moment; 1.5s hold + subtle zoom.
- Keep the **chain badge** (TestNet + app-ids) and the **source indicator** in frame at least once.
- Lower-third captions per beat (Rank / Pay / Catch / Verdict / Re-route / Registry). End card: tagline + repo URL + "Algorand · Infrastructure track".

## Fallback ladder
1. **Server down / payer unfunded** → UI auto-falls back to mock; indicator shows it. Proceed; the loop is identical.
2. **Network flaky on-site** → run the pre-recorded video (this storyboard).
3. **Projector/contrast** → present mode + zoom handle it.

## Timing cheat sheet
| beat | t | what the audience must see |
|---|---|---|
| 1 | 0:12 | ranked by trust, not price |
| 2 | 0:38 | challenge > active quote, in red |
| 3 | 1:05 | reputation drops, anchored |
| 4 | 1:32 | **re-run reroutes — self-correction** |
| 5 | 1:58 | reviews audit to a payment · real registry app-ids |
| 6 | 2:30 | hash-only, verifiable on TestNet |
