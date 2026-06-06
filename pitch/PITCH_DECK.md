# Pitch Deck — x402 Trust Router on Algorand

7 slides (6 core + 1 honesty). Each: **on-slide text** (terse — speak the rest) ·
**visual** · **speaker note**. Design: Liminal frontier palette (near-black bg,
warm-cream text, clarity-violet accent), Geist + Geist Mono + a serif display.
Keep ≤12 words per line on screen.

---

## Slide 1 — Title
**On slide:**
- ◇ **Liminal · x402 Trust Router**
- *Reputation the chain enforces, not self-reported.*
- Algorand Builders Berlin · Infrastructure track
**Visual:** wordmark on near-black; one faint line: `ERC-8004-shaped · Algorand-native · x402 · TestNet`.
**Note:** "We built the trust layer for agent-to-agent commerce. Thirty seconds on why it's needed, then a live demo."

---

## Slide 2 — The problem
**On slide:**
- Agent marketplaces rank by **price + self-reported reputation**.
- Cheapest wins → **hidden fee at checkout**.
- Self-reported trust is **gameable**.
- As agents pay agents, this is the trust gap.
**Visual:** a ranked list; #1 "cheapest" with a red "+hidden fee" sticker at checkout.
**Note:** "The flight-aggregator pattern, about to scale to machines. There's no trust the chain enforces."

---

## Slide 3 — The solution (one sentence + loop)
**On slide:**
- A **trust router** over x402 on Algorand.
- request → **rank** (price + earned reputation + validation) → pay → **validate vs quote** → re-route.
- *Caught once → routed around next time.*
**Visual:** the 6-beat loop spine (Request · Rank · Pay · Validate · Reputation · Re-run) as a ring.
**Note:** "Reputation is earned through payment-backed validation, not claims. This is the whole product in one line — now watch it."

---

## Slide 4 — DEMO (live) ★
**On slide:**
- **LIVE DEMO**
- the caught-cheating self-correction
**Visual:** switch to the app. (Fallback: pre-recorded clip — see DEMO_STORYBOARD.md.)
**Note:** Drive the loop (sidebar nav; TestNet badge bottom-right). The beat that must land: **x402 challenge > active quote → automatic validation drops reputation → re-run reroutes to the honest provider.** Then sidebar → **Marketplace** (click a score → the **transactions behind it**) and **Contracts** (registry app-ids + ABI).

---

## Slide 5 — The stack / why it's infrastructure
**On slide (4-layer stack):**
```
L4  x402 settlement            (pay-per-call)
L3  ERC-8004 registries        identity · reputation · validation
L2  Earned-trust discipline ←  the layer we build
L1  Algorand                   sub-cent · instant-final · 1KB note
```
- L3 names the registries; **L2 is what makes an entry earned.**
**Visual:** the stack, L2 highlighted in clarity-violet.
**Note:** "x402 assumes the caller is trustworthy; ERC-8004 assumes earned inputs. We build that discipline — and ported the registries to Algorand: ARC-72, ARC-28, ARC-60."

---

## Slide 6 — Why Algorand
**On slide:**
- **Same-ledger x402** → proof-of-payment is native, not a foreign hash.
- **Sub-cent + instant finality** → validation is a routine side-effect; next route can trust it.
- **1KB note** → hash-only anchor: verifiable by anyone, exposes nothing.
**Visual:** a ledger row → **TestNet** explorer link (`lora.algokit.io/testnet`); "hash-only" stamp.
**Note:** "On Algorand the payment and its proof are on the same chain. That's the unlock for an agent-economy trust layer."

---

## Slide 7 — Honesty + ask (Criterion 7)
**On slide:**
- ERC-8004: Aug-2025 **draft**, not on Algorand → ours is **ERC-8004-shaped, Algorand-native**.
- **Live on TestNet** (real txids): x402 settlement · hash-only anchoring · automatic validation.
- On-chain registries (Identity/Reputation/Validation) built + unit/e2e-tested; ranking math is an in-memory mirror today.
- `giveFeedback` is env-gated for payment-backed user feedback; x402 `paymentTxid` + `nonce` still TODO.
- "Validated reputation" = active quote vs x402 challenge + future attestations — not a general oracle.
- *ERC-8004 gives agents a passport. We give the marketplace a conscience.*
**Visual:** tagline large; small repo/QR.
**Note:** "We were deliberate about not faking the chain parts. Real today: settlement, anchoring, and automatic validation changing the next route. Next: x402-complete feedback and full ranking on-chain. Thank you."

---

## Appendix slides (Q&A only — don't present)
- **A1 · On-chain vs off-chain:** what's anchored (settlement, hash-only verdict/reputation) vs committed-by-hash off-chain.
- **A2 · ERC-8004 → AVM mapping:** ARC-72 identity, ARC-28 events, ARC-60 sig, box storage, native keccak256.
- **A3 · Architecture:** UI ↔ router-server (:3001) ↔ x402 facilitator ↔ Algorand; registries.
- **A4 · Roadmap:** deploy the three registry apps on testnet; live provider discovery; output-quality validation.
