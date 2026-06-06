# ERC-8004 × Liminal Vocabulary Crosswalk

**For:** Shruti + Sean — Berlin Algorand Hackathon prep + AIS26 HackAIthon (Jun 19–21) ERC-8004 track
**Date:** 2026-05-26
**Status:** Draft — internal positioning artifact; not for external release without counsel review (PPA #10 still pre-filing per `decisions/2026-05-19-ppa10-privacy-invariant-blackboard-candidate.md`)
**Parent canon:**
- `liminal-agents/PATENT_CLAIMS.md` (PPAs #4, #5, #6 candidate, snapshot-set hash)
- `liminal-agents/PRIVACY_INVARIANTS.md` (three invariants — PPA #6 substrate)
- `founder-brain/decisions/2026-05-19-ppa10-privacy-invariant-blackboard-candidate.md` (privacy-invariant blackboard)
- `founder-brain/decisions/2026-05-21-chain-anchor-pattern.md` (Pattern 3 Algorand anchor)
- `hackathons/algorand-berlin-2026/RECON.md` (existing submission angle)

---

## TL;DR — one paragraph

ERC-8004 names the *registries* an open agent economy needs (identity, reputation, validation) and leaves the *substrate behavior* unspecified — what the agent must internally enforce so its on-chain reputation is *earned*, not gamed. Liminal's four shipped primitives (bounded refusal, correction stream, privacy-invariant blackboard, chain-anchor pattern) are exactly that missing substrate. **ERC-8004 = the public ledger of agent behavior. Liminal = the internal discipline that makes the ledger entries worth reading.** Different layers, complementary, not competing. Pitch register: "ERC-8004 gives agents a passport. We give them a conscience."

---

## The vocabulary map — primitive-to-primitive

### ERC-8004's three registries (canon, per Aug 2025 spec)

| Registry | What it does (verbatim register) | What it requires of the agent |
|---|---|---|
| **Identity Registry** | ERC-721 NFT per agent → JSON "agent card" with capabilities, endpoints (MCP/A2A/web), payment address | Agent must *be* something stable and addressable |
| **Reputation Registry** | Bounded integer score + optional tags + URI to detailed off-chain report (JSON) + KECCAK-256 hash of that report for integrity | Agent must *generate* feedback artifacts that are honest, structured, and verifiable |
| **Validation Registry** | Cryptographic + economic verification of agent work | Agent must *prove* its outputs are what it claims they are |

**The structural gap ERC-8004 leaves open:** *all three registries assume the agent has internal mechanisms producing trustworthy inputs.* The spec governs the registries; it does not govern what makes the agent's behavior worth registering. A malicious or sloppy agent can populate identity, reputation, and validation registries with garbage that's cryptographically signed garbage. The on-chain layer is necessary but not sufficient.

### Liminal's four substrate primitives (canon, per PATENT_CLAIMS.md)

| Liminal primitive | What it does | What problem it solves at substrate layer |
|---|---|---|
| **PPA #4 — Bounded Agent Refusal** | Each agent has explicit declared domain + anti-domain mapped to a topology (clock geometry, DAG geometry); refusal is a first-class output, not error fallback; refusals route to a topology-derived allowlist of named peer agents | Prevents agents from claiming work outside their competence; makes "I don't know, ask X" a designed behavior |
| **PPA #5 — Correction Stream** | User corrections are immutable typed events alongside original agent reads; closed 9-tag taxonomy; agents NEVER read prior corrections — the *record* compounds, not the model | Disagreement-as-data; the moat is the user's correction history, not model adaptation |
| **PPA #6 candidate — Privacy-Invariant Blackboard** | Vault never crosses system boundaries; typed event projections with bounded payload at emission; emergence-class events structurally excluded from cross-boundary projection by category | Highest-value user-generated data category is *locally inviolable* by architecture, not policy |
| **Chain-Anchor Pattern (May 21 decision)** | Selective per-packet anchor on Algorand; user-judged-permanent packets get on-chain anchors via note-field transactions (~$0.0001); anchoring is an explicit user act of judgment | Tamper-evidence on backed-up content; sovereignty layer (user decides what becomes permanent) |

---

## The crosswalk — primitive by primitive

### Crosswalk 1: ERC-8004 Identity Registry × Liminal Bounded Refusal (PPA #4)

| ERC-8004 says | Liminal substrate says |
|---|---|
| Agent has an NFT identity with a JSON card declaring capabilities, endpoints, payment address | Agent has a *typed position in a topology* (clock coordinates, DAG phase+direction) that bounds its competence to a structurally adjacent peer set |
| Capabilities are self-declared in the agent card | Capabilities are enforced at runtime — out-of-topology routing fails as `geometry_violation` with a `geometry` discriminator |
| Agent can list any capability it wants | Agent's allowlist is *topology-derived* at module-load; the agent cannot invent peer names |
| Discovery: "I exist, here's what I do" | Refusal: "That's not my ground — talk to [named peer]" is a designed first-class output |

**The crosswalk claim:** ERC-8004's Identity Registry tells the world *what the agent claims to be*. Liminal's bounded refusal tells the agent *what it cannot do without violating its own structural position*. **An agent card is a marketing claim; bounded refusal is a structural commitment.** The two compose: the agent card declares capabilities, the refusal substrate enforces that the agent will *say no when asked outside them*.

**Concrete demo for the hack:** an agent's ERC-8004 agent card declares `["read_calendar", "draft_email"]`. When called for `["execute_trade"]`, the Liminal bounded-refusal layer returns a structured refusal naming the correct peer agent — *and the refusal itself is signed and ledger-anchorable* (PPA #5 pattern). Refusal-as-credibility becomes refusal-as-reputation-signal.

**Pitch sentence:** *"ERC-8004 gives agents passports. We give them the ability to credibly say 'not my jurisdiction.'"*

---

### Crosswalk 2: ERC-8004 Reputation Registry × Liminal Correction Stream (PPA #5)

This is the **load-bearing crosswalk** — the structural overlap is the strongest.

| ERC-8004 says | Liminal substrate says |
|---|---|
| Bounded integer score + optional tags + URI to off-chain report + KECCAK-256 hash | Closed 9-tag correction taxonomy + immutable typed events + audit chain |
| Client (user or other agent) records feedback about interaction | User correction is recorded alongside the original agent read |
| Feedback is *additive* — scores accumulate over time | Corrections are *immutable* — agents never read prior corrections; the record compounds, not the model |
| Off-chain JSON report contains "logs, artifacts, or receipts" | Liminal correction event contains the correction text, tag from frozen enum, and reference to the original agent reading |
| KECCAK-256 hash anchors integrity | Algorand note-field anchor (Pattern 3) anchors integrity |

**The structural overlap is real and worth being honest about:** both systems converge on the same shape — *bounded structured feedback + integrity-hashed off-chain detail + chain-anchored reference*. The Liminal claim (PPA #5) and ERC-8004's reputation pattern are doing structurally similar work.

**Where they diverge — and this is the defensible novelty:**

1. **Closed taxonomy vs open tags.** ERC-8004 allows optional tags (free-form). Liminal's 9-tag correction taxonomy is *frozen at the schema layer*; extending it bumps `schema_version`. This is the difference between "feedback you can sort by" and "feedback that participates in a typed substrate."

2. **Disagreement-preservation invariant.** ERC-8004 reputation is *aggregable* — bounded scores accumulate. Liminal's invariant is the *opposite*: agents never read corrections. The record compounds; the agents stay bounded. This means Liminal agents *cannot drift toward the median user opinion* — a property ERC-8004 has no opinion on.

3. **Counter-cyclical to AI capability.** ERC-8004 reputation gets *more accurate* as more agents interact (network effect on the registry). Liminal's correction stream gets *more interesting* as model capability improves (better models produce sharper reads, which produce richer disagreements, which deepen the record). Different feedback loops, different moat shapes.

**Pitch sentence:** *"ERC-8004 reputation tracks what agents did. Liminal correction stream tracks where they were wrong — and refuses to let them learn from it. The disagreement is the data."*

**Submission angle:** an ERC-8004 reputation entry that points to a Liminal correction-stream URI. The on-chain score is "75/100 with 12 corrections logged"; the off-chain report is the typed correction events with their 9-tag classification. This is a *natural composition* — Liminal's correction stream is exactly the kind of off-chain detail ERC-8004 reputation entries are designed to reference.

---

### Crosswalk 3: ERC-8004 Validation Registry × Liminal Privacy-Invariant Blackboard (PPA #6/#10)

This is where the **vocabulary gets sharpest** because both systems are doing verification, but from opposite ends.

| ERC-8004 says | Liminal substrate says |
|---|---|
| Cryptographic + economic verification of agent work | Vault content *never crosses boundaries*; only typed event projections do, with bounded payload semantics at emission |
| Validators verify outputs after the fact | Boundary discipline prevents leak at the substrate layer — there is no "after the fact" because the data never left |
| Validation is a *trust mechanism* — proves the work was done correctly | Privacy invariance is a *substrate mechanism* — proves the work was done *without ever exposing the substrate* |
| Validators are an additional on-chain participant class | The substrate is *self-validating by architecture* — no validator needed because no boundary crossing happened |

**The crosswalk claim:** ERC-8004 Validation assumes the agent's work *will be examined* and provides mechanisms for that examination. Liminal's privacy-invariant blackboard makes a different claim: *the substrate the agent operated against need not be exposed for the work to be trusted.* The emergence-class category exclusion (PPA #10 mechanism 5) is the architectural primitive: *some categories of data structurally cannot cross the boundary, by category not by content filter.*

**Where this matters for x402:** in agent-to-agent commerce, validation is the bottleneck. Either (a) the buying agent trusts the selling agent's output blindly, (b) the buying agent inspects the substrate that produced the output (privacy-violating, expensive), or (c) the selling agent produces *verifiable artifacts* without exposing substrate. Liminal's privacy-invariant blackboard + correction-stream URI pattern is option (c) — the buying agent verifies the seller's reputation via ERC-8004 + the off-chain correction history, without ever needing access to the seller's substrate.

**Pitch sentence:** *"ERC-8004 lets agents prove their work was done right. We let agents prove their work was done right without ever showing you how they did it."*

---

### Crosswalk 4: ERC-8004 (across registries) × Liminal Chain-Anchor Pattern

The **operational integration point** — where Liminal's existing Algorand decision meets ERC-8004's chain-anchor requirements.

| ERC-8004 says | Liminal substrate says |
|---|---|
| Three registries on-chain (originally Ethereum) | Chain-anchor on Algorand via note-field transactions (Pattern 3 decision, May 21) |
| Reputation registry stores hash of off-chain detail | Liminal anchors selective packets to Algorand via note-field |
| Validation requires on-chain proof | Anchoring is an explicit user judgment — anchoring decisions are themselves vault-relevant corrections |
| Originally Ethereum L1; portable in principle | Algorand wins on cost + finality + payload (per chain-anchor decision rationale) |

**The crosswalk claim:** ERC-8004 was specified Ethereum-first but is *agnostic at the spec layer*. Liminal already made the Algorand-native chain-anchor decision (May 21, Pattern 3) based on sovereignty + cost + finality criteria. **An ERC-8004 implementation on Algorand is the natural composition** — Algorand's note-field is the substrate ERC-8004 needs, and Liminal's Pattern 3 selective-anchoring is the *user-judgment overlay* ERC-8004 doesn't specify.

This is where **the hack submission writes itself**: implement ERC-8004's three registries on Algorand using Liminal's existing chain-anchor pattern + Pattern 3 selectivity (user decides what gets anchored to reputation) + x402 settlement for write operations (paying to anchor reputation entries enforces economic skin-in-the-game).

**Pitch sentence:** *"ERC-8004 was specified Ethereum-first because that's where the agent economy was loudest. Algorand is where it actually settles."*

---

## The composition story — for hack judges + investor register

### The four-layer stack (proposed)

```
┌─────────────────────────────────────────────────────┐
│  LAYER 4: x402 Settlement                           │
│  (Coinbase Foundation, donated to Linux Foundation) │
│  - Pay-per-request agent commerce                   │
│  - HTTP 402 + stablecoin authorization              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  LAYER 3: ERC-8004 Agent Registries                 │
│  (Ethereum Foundation + MetaMask + Google + Coinbase)│
│  - Identity Registry (NFT agent cards)              │
│  - Reputation Registry (bounded score + URI + hash) │
│  - Validation Registry (crypto + economic proofs)   │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  LAYER 2: Liminal Substrate Discipline ← THE GAP    │
│  (Liminal — proprietary, PPA #4/#5/#6/#10 + chain   │
│   anchor pattern)                                   │
│  - Bounded refusal (PPA #4)                         │
│  - Correction stream (PPA #5)                       │
│  - Privacy-invariant blackboard (PPA #10)           │
│  - Chain-anchor selectivity (May 21 decision)       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  LAYER 1: Algorand (settlement chain)               │
│  - Atomic transaction grouping                      │
│  - Low cost, deterministic finality, 1KB note field │
└─────────────────────────────────────────────────────┘
```

**The thesis-sentence:** Layer 2 is the gap. ERC-8004 (Layer 3) assumes Layer 2 exists but does not specify it. x402 (Layer 4) assumes the agent calling the protocol is *trustworthy enough to pay*, but does not specify how that trust is built. **Liminal's substrate primitives are the missing Layer 2 — the agent-internal discipline that makes the registries above worth populating and the settlement below worth executing.**

### Where this lands for each audience

| Audience | The crosswalk sentence |
|---|---|
| **Algorand Foundation judges** | "We're not building another commerce app; we're building the substrate discipline that makes the agent economy on x402 + ERC-8004 trustworthy enough for institutional adoption." |
| **GoPlausible / facilitator team** | "Our correction-stream URIs are exactly the off-chain detail ERC-8004 reputation entries are designed to point at — and we already anchor to Algorand note fields." |
| **0xMihej / AI Agents Berlin community** | "The agentic economy needs more than payment rails. It needs agent-internal discipline. We're the substrate layer the registries assume exists." |
| **YC / Speedrun investor register** | "Counter-cyclical to AI capability + structural privacy guarantees + chain-anchored correction stream. The substrate the agentic economy will need but isn't building." |
| **DARPA DICE (parallel May 29 target)** | "Same architectural primitives that make agent commerce trustworthy on x402 also make agent coordination resilient under adversarial conditions. The discipline is composable across deployment contexts." |

---

## What to be honest about (Criterion 7 self-check)

1. **ERC-8004 is not yet production-dominant.** The spec is from Aug 2025; adoption is early. Don't pitch "ERC-8004 is the standard" as present-tense. Pitch "ERC-8004 names the registries the agent economy needs" — the *naming* is canonical; the *adoption* is in flight.

2. **Liminal's substrate primitives are not yet anchored on-chain in production.** PPA #4 and #5 are shipped in `liminal-agents`. PPA #6/#10 (privacy-invariant blackboard) is reduction-to-practice-complete in `liminal-notion-hack` but not yet transplanted to the Spine. The chain-anchor pattern is *decided* (May 21) but *not yet implemented*. The hack itself is the natural integration moment.

3. **The "we are Layer 2 in this stack" framing is a positioning claim, not yet a deployed reality.** Be honest in pitch register: "the substrate primitives are shipped; the on-chain integration is what we're building this hack to demonstrate."

4. **PPA #10 is RATIFIED but pre-filing.** The privacy-invariant blackboard language can be discussed *architecturally* in public but the specific claim language should not be published before filing (per the decision's `private: true` frontmatter). For hack submission: describe the *behavior* ("vault never crosses boundaries; emergence-class events are local-only by category"), not the *claim language*. Counsel review before any public surface uses the PPA #10 specific phrasing.

5. **Pattern overlap with ERC-8004 Reputation Registry is real.** Crosswalk 2 acknowledges this honestly. Liminal's correction-stream substrate and ERC-8004's reputation registry are *doing structurally similar work*. The novelty is in (a) closed-taxonomy vs open-tag discipline, (b) disagreement-preservation invariant (agents don't read corrections), and (c) counter-cyclical-to-capability feedback loop. These are *real distinctions* but they're not "we invented reputation tracking" — they're "we invented a specific discipline within the reputation-tracking design space."

---

## Concrete deliverables this crosswalk enables

For the **Algorand hack (June 6–7)** Infrastructure track:

- ERC-8004 reference implementation on Algorand using Liminal's chain-anchor pattern
- Reputation registry entries pointing to Liminal correction-stream URIs as off-chain detail
- x402 settlement on registry write operations (economic skin-in-the-game)
- Demo: agent A makes a claim, agent B challenges via correction, the correction lands on Liminal's substrate, the reputation registry updates, the anchor lands on Algorand

For the **AIS26 HackAIthon (June 19–21)** ERC-8004 track:

- Same substrate, framed as Layer 2 for the agent infrastructure stack
- Composition demo with the official ERC-8004 reference implementations (Ethereum L1 or L2)
- Comparative discussion: why Algorand-native registries make agent commerce viable in ways Ethereum L1 doesn't

For **internal IP positioning:**

- The crosswalk *strengthens* PPA #4/#5/#6/#10 by naming what the proprietary substrate *adds* relative to a public standard
- The crosswalk does *not weaken* the claims because Layer 2 (substrate discipline) is structurally distinct from Layer 3 (on-chain registries)
- Counsel review post-hack to confirm the public crosswalk language doesn't accidentally pre-empt filing

---

## Open questions for Shruti

1. **How much of this becomes public hack-submission collateral vs internal positioning?** The Layer 2 framing is strong for judges; the specific claim-language for PPAs should stay private. Probably: ship the stack diagram + the "we are Layer 2" framing publicly; keep the per-PPA crosswalk tables internal until counsel review.

2. **Is the ERC-8004 track at the June 19–21 HackAIthon a separate submission?** Two hacks, two submissions, same substrate — or sequenced narrative across both events? Sean's bandwidth question.

3. **Whitepaper #2 implication.** The crosswalk *belongs in Whitepaper #2* architecturally. Should the hack submission collateral preview the whitepaper-shape, or stay tactical/demo-focused?

4. **Counsel before Berlin?** If the crosswalk gets used publicly at the hack, ideally Aravinda or Judith reviews the language first. Timing-wise: counsel-by-June-3 (the pre-hack workshop) is tight but possible.

---

## Provenance

- **Drafted:** 2026-05-26 in Claude Code session, in response to Shruti's request after Berlin hack ecosystem recon
- **Canon read before drafting:** PATENT_CLAIMS.md, PRIVACY_INVARIANTS.md, decision 2026-05-21 (chain anchor), decision 2026-05-19 (PPA #10), RECON.md
- **Status:** DRAFT — needs Shruti review, counsel review before any public use, integration with RECON.md submission angle
- **Distribution:** internal only until ratified; subset (stack diagram + Layer 2 framing) authorized for hack pitch post-Shruti ratification
