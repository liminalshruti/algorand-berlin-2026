# End-to-end hack scope — x402 trust router on Algorand

**Date:** 2026-06-06 (hack day 1) · **Category:** Infrastructure · **Problem:** agentic trust
**Team:** 4 (Shruti + Shayaun + 2) · **Merge target:** midnight tonight
**Status:** scoping — validate each layer (§4) before kicking off build

---

## 1. One sentence

A **trust router** over x402 on Algorand: an operator asks for a service; we collect competing
providers' on-chain price quotes, rank them by **price + earned reputation + validation**, pay the
winner, then **validate the delivery against its quote on-chain** — so a provider that quotes low and
charges high (or under-delivers) gets caught by the chain and loses the next route. Reputation is
*earned*, not self-reported.

## 2. The value prop (do not lose this when scoping)

Existing agent marketplaces (Agent.market, etc.) rank on price + **self-reported** reputation — which
is gameable (the flight-provider pattern: always cheapest in the ranking, then hidden fees at
checkout). The missing infrastructure is **validated reputation**: trust that the chain enforces.
That validation layer is what we build. *"ERC-8004 gives agents a passport; we give the marketplace
a conscience."*

## 3. Key finding — most of the stack already exists

| Capability | Where it already lives | State |
|---|---|---|
| x402 challenge (402) + lane guard | `liminal-agents-v1` `sandbox/lib/x402/{challenge,lane-guard}.js`; also `provenance/src/x402/gate.ts` | ✅ runs |
| Verify → settle on Algorand | `liminal-agents-v1` `sandbox/lib/x402/{facilitator,algorand}.js`; `provenance/src/chain/algorand.ts` | ✅ runs (localnet 06-01) |
| Hash-only provenance anchor | both repos; anchor fields excluded from hash | ✅ tested |
| Reputation = correction survival (ERC-8004-shaped) | `liminal-agents-v1` `sandbox/lib/x402/reputation.js` + `/api/correct` | ✅ sandbox-stage |
| 9-tag correction taxonomy | `liminal-agents-v1` `lib/corrections/index.ts` | ✅ |
| Desktop anchor schema (txid/chain/network cols) | `liminal-desktop` `src-tauri/src/db/schema.rs` | ⚠️ stubbed (NULL) |

**The hack delta (what does NOT exist yet):** multi-provider **discovery/registry**, **quote
collection across providers**, the **ranking / weighted-lottery** module, the **price-vs-quote
validation**, and the **reputation write-back keyed per provider**. Plus a **UI**.

## 4. Stack feasibility — validate each layer BEFORE building

Bottom-up. Verdict legend: ✅ reuse · ⚠️ reuse+extend · 🔨 build · ❓ validate first.

| # | Layer | Exists? | Build needed | Risk | Verdict |
|---|---|---|---|---|---|
| 1 | Algorand settlement (L1) | Yes (localnet verified 06-01) | none | testnet funding unfunded | ✅ |
| 2 | x402 challenge/settle | Yes (both repos) | none | — | ✅ |
| 3 | Hash-only anchor | Yes (tested) | none | — | ✅ |
| 4 | Bounded refusal / lane guard | Yes | none | — | ✅ |
| 5 | Reputation entry (score + URI + hash) | Yes (sandbox) | key per-provider; read at routing time | in-memory/pre-seeded today | ⚠️ |
| 6 | Provider discovery / registry | No | list candidates per task | **Agent.market callability UNVALIDATED** | ❓🔨 |
| 7 | Quote collection (price) | Partial | collect each provider's 402 (`amount/asset/payTo`) | external 402s may need auth | 🔨 |
| 8 | Ranking / weighted lottery | No | pure fn: `f(price, reputation, validation)` | low — just math | 🔨 |
| 9 | Validation — price-vs-quote | Partial | compare challenge.amount vs settled amount | low — both on-chain | 🔨 |
| 9b | Validation — output check | No | evaluator (objective for scan; judged for inference) | fuzzy; do as stretch | 🔨 |
| 10 | Reputation write-back loop | Partial | trigger `/api/correct`-style write from verdict | medium | ⚠️ |
| 11 | UI (ranked list + approve + receipt) | No | standalone web UI vs desktop wiring | desktop = Rust+Solid, slower | 🔨 |

**Two layers gate everything — validate in the first hour:**
- **Layer 6 (❓):** confirm whether ≥2 Agent.market providers actually return a 402 to *our* funded
  wallet today. If yes → live demo. If no → **3 local mock providers** (honest / hidden-fee /
  low-quality) give identical mechanics on LocalNet. Decide this before building the registry.
- **Layer 1 (testnet funding):** fund the dispenser, or commit to LocalNet (instant, real txids,
  zero funding) as the demo surface. LocalNet is the safe default.

## 5. Dataflow

```
                          ┌─────────────────────────────────────────────┐
   Operator / agent       │            TRUST ROUTER (the build)          │
   "I need <task>"  ─────▶│                                              │
                          │  (6) discover providers for <task>           │
                          │        │  Agent.market  OR  3 mock providers │
                          │        ▼                                     │
                          │  (7) collect quotes ── 402 from each ───────┐│
                          │        │  {payTo, amount, asset, resource}  ││
                          │        ▼                                     ││
                          │  (5) read reputation per provider ◀─────────┼┼──┐
                          │        │   (from on-chain rep log)          ││  │
                          │        ▼                                     ││  │
                          │  (8) RANK = f(price, reputation, validation) ││  │
                          │        │   weighted lottery, zero-rep excl.  ││  │
                          │        ▼                                     ││  │
   approve / deny  ◀──────┤   operator gate (sovereignty)               ││  │
        │                 │        ▼                                     ││  │
        └────────────────▶│  (2) pay winner via x402                    ││  │
                          │        ▼                                     ││  │
                          │  (1) SETTLE on Algorand ──▶ txid            ││  │
                          │        ▼                                     ││  │
                          │     provider delivers result + settled $    ││  │
                          │        ▼                                     ││  │
                          │  (9) VALIDATE: settled $ == quoted $ ?       ││  │
                          │        │  output passes ?                    ││  │
                          │        ▼                                     ││  │
                          │  (10) verdict ─▶ reputation write-back ──────┼┘  │
                          │        ▼                                     │   │
                          │  (3) anchor decision+payment+verdict ────────┼───┘
                          │        (hash-only on Algorand)              │  on-chain
                          └─────────────────────────────────────────────┘  rep log
                                         │
                                         ▼
                          on-chain ledger: who paid whom, how much,
                          quoted-vs-settled, verdict — verifiable, hash-only
```

Re-run after a bad verdict → the lottery routes *away* from the caught provider. **That self-correction
is the demo centerpiece.**

## 6. Scope — in / out

**IN (MVP, must demo):**
- Trust router: discovery (mock or live) → quote collection → ranking → operator gate → pay → settle.
- **Price-vs-quote validation** (objective, on-chain) + reputation write-back per provider.
- The closed loop: bad verdict → reputation drops → re-run routes differently.
- Minimal standalone UI: ranked providers + trust score, payment txid, the "caught" moment, the ledger.

**STRETCH (only if MVP is green):**
- Live Agent.market providers (vs mock). Output-quality validation. Public testnet (vs LocalNet).
- `liminal-desktop` wiring (anchor fields → receipt display + approval gate in SlateView).

**OUT (24h):**
- Building a marketplace or providers. Network crawler. Decentralized inference hosting.
- Multi-chain abstraction. Production TTL/DB (in-memory is fine). Zero-knowledge validation proofs.

## 7. Swimlanes (4 people)

**Hour 0 (all): freeze the router API contract** so FE/BE proceed in parallel. Minimum:
`POST /route {task} → {options:[{provider, price, reputation, trust}]}` ·
`POST /pay {provider, optionId} → {txid, settled}` · `POST /validate {txid} → {verdict, newReputation}`.

| Member | Lane | Owns | Done = |
|---|---|---|---|
| **Shruti** | UX / front-end | Standalone web UI: ranked list + trust score, approve/deny gate, payment txid, the caught-cheating beat, on-chain ledger view. Storyboard + demo script. | UI PR'd 9pm, merged midnight |
| **Shayaun** | Chain / x402 core | Stand up the spine server (berlin-server or provenance) on Algorand (LocalNet→testnet); the `/pay`→settle→anchor path; fund/verify wallets. | real txid from a router pay call |
| **New A** | Registry / price | Provider discovery (validate Agent.market live in hour 1, else 3 mock providers) + quote collection + the ranking / weighted-lottery module. | `/route` returns ranked options |
| **New B** | Validation / reputation | Price-vs-quote validator (+ output check if time); reputation write-back keyed per provider; ERC-8004-shaped anchoring. | bad verdict drops a provider's score on-chain |

Critical path: New A's `/route` depends on New B's reputation read + Shayaun's quotes; Shruti depends
only on the frozen contract (mock the API until BE is live). Integration owner: Shayaun.

## 8. Demo flow (~3 min, the winning beat)

1. Operator: "I need `<task>`." Router shows **3 ranked providers** with price + trust score.
   Provider C is cheapest.
2. Weighted lottery picks C (or operator approves). **Pay via x402 → Algorand txid on screen.**
3. C delivers — but **settled amount > quoted amount** (hidden fee). Validation catches the gap
   *from on-chain data*.
4. **Reputation write-back:** C's score drops, anchored on Algorand (show the entry).
5. **Re-run the same request → router now routes to honest provider B.** The system self-corrected.
6. Show the **on-chain ledger**: every decision + payment + verdict, hash-only, verifiable by anyone,
   exposing no private substrate.

**Fallback:** if live providers/testnet slip, run all of it with mock providers on LocalNet — same
loop, real txids, fully controlled.

## 9. Pitch (~75s)

- **Hook:** "Agent marketplaces rank by price. The cheapest provider wins — then adds hidden fees at
  checkout. Self-reported reputation is gameable."
- **Problem:** agentic commerce has no *earned* trust layer.
- **Solution:** a trust router over x402 on Algorand — reputation earned through on-chain validation
  (the chain catches the quote-vs-settled gap), not self-reported.
- **Demo:** the caught-cheating self-correction loop.
- **Why us:** we already run the substrate — bounded refusal, correction stream, hash-only anchoring —
  the discipline that makes registry entries trustworthy. *"ERC-8004 gives agents a passport; we give
  the marketplace a conscience."*
- **Why Algorand:** cheap, instant finality, 1KB note as the anchor substrate; GoPlausible facilitator
  is live.
- **Vision:** the missing trust infrastructure for the agent economy.

## 10. Open decisions (resolve before/at hour 0)

1. **Which repo is the spine/submission?** `liminal-agents-v1` berlin-server already has reputation +
   graph but is **private** (PPA gate to go public). The locked submission decision says the *judged*
   repo is public `hackathons/algorand-berlin-2026` (MIT), citing liminal-agents as substrate.
   → Recommend: build the router in the **public hackathons repo**, porting the reputation bits;
   demo can run whichever is fastest. Confirm.
2. **Live Agent.market vs mock providers?** Gated on hour-1 callability check.
3. **Desktop in scope?** Recommend **stretch / post-hack** (Rust+Solid wiring is slower than a
   standalone UI; the anchor schema is ready when you want it).
4. **LocalNet vs testnet** for the live demo? Recommend LocalNet as the safe spine, testnet as bonus.

## 11. Risks

- **Layer 6 (live providers) unvalidated** — mock fallback removes the dependency. Decide hour 1.
- **Testnet funding** still 0 µALGO — LocalNet is the safe demo.
- **Two x402 codebases** (berlin-server vs provenance) — pick one spine hour 0; don't split effort.
- **Latency** of per-call on-chain settle — LocalNet is instant; batch if needed.
- **Output-quality validation is fuzzy** — lead with objective price-vs-quote; output check is stretch.

## 12. Honesty (criterion 7)

- We use Agent.market + its providers; we did not build the marketplace.
- "Validated reputation" = the specific checks we run (price-vs-quote, output check) — not a general
  validation registry. ERC-8004 "names the registries"; it is **not deployed on Algorand** — ours are
  ERC-8004-*shaped*, Algorand-native.
- LocalNet/mock is an honest demo surface; say so if testnet/live slip.
