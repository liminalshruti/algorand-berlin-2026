# ERC-8004 × x402 on Algorand — Data-Shape Research + Verification Addendum

**Date:** 2026-06-06 · **Status:** research record + delta over `ERC8004_AVM_MAPPING.md`.
**Build target stays:** `ERC8004_AVM_MAPPING.md` (the construct-by-construct port) and the
per-person `ref/SPEC_*.md`. This file does **not** restate that mapping — it (a) verifies it against
primary sources, (b) supplies the few data-shape facts it was missing, and (c) records one design
disagreement and how it resolved.

**Provenance.** Deep-research harness: 5 search angles → 19 primary sources fetched → 93 claims
extracted → 25 verified under 3-vote adversarial review → **25 confirmed, 0 killed**. Every claim
below is anchored to a primary spec (EIP-8004, coinbase/x402 v1+v2, Algorand ARCs / AVM docs), not
blog-quality sourcing. Sources listed at the end.

---

## 0. The question this answers

*"How does enriching ERC-8004 reputation feedback with x402 payment proofs change the shape of the
data, once the registries are ported EVM → Algorand?"* — across four dimensions: (1) on-chain
structures, (2) entity/relationship model, (3) signal/information shape, (4) storage/cost & access.
The four-dimension synthesis is in §6; the actionable deltas for our build are §2–§5.

---

## 1. What the mapping doc already got right (now primary-source-backed — use as pitch ammo)

These were open questions; `ERC8004_AVM_MAPPING.md` already had them correct. Citations added so they
can be stated with confidence to judges:

| Fact | Confirms | Source |
|---|---|---|
| `keccak256` is a **native AVM opcode** (`0x02`, cost 130) and is *original Keccak-256* — byte-for-byte identical to Ethereum's `keccak256`, so `feedbackHash`/`responseHash`/`requestHash` are cross-chain interoperable | mapping §0, §2.4, §4 | AVM opcode ref; EIP-8004 |
| Feedback `value` is **`int128` + `uint8 valueDecimals` (0–18)** — a *signed fixed-point*, NOT a bounded 0–100 integer (spec example `tradingYield value=-32, decimals=1` → `-3.2%`) | mapping §2.4 `byte[16]` port | EIP-8004 `giveFeedback` sig |
| Identity = ERC-721 (`ERC721URIStorage`), `agentId=tokenId`, `agentURI=tokenURI`; ARC-72 is the faithful AVM counterpart | mapping §1 | EIP-8004; ARC-72 |
| Atomic transaction groups give **native all-or-nothing** execution (≤16 txns) → the "settle + write reputation in one group" + fee-pooling patterns are real | mapping §4 | Algorand atomic-txn docs |
| The spec **explicitly invites** a `proofOfPayment` field for x402 ("payments orthogonal … examples show x402 enriching feedback") — so the §7 x402 profile is in-spirit, not a fork | mapping §7 | EIP-8004 |

> Note for the record: my first conversational pass mis-stated `value` as a bounded integer. The
> mapping doc's `int128 → byte[16]` port (§2.4) is the correct shape. Build against the doc.

---

## 2. The canonical off-chain feedback JSON envelope (MISSING from our docs — pin it)

Shayaun's spec defines `verdict_uri` / `uri` but never pins the JSON shape. **EIP-8004 does.** Verbatim
from the spec (the file `feedbackURI` resolves to):

```jsonc
{
  // MUST
  "agentRegistry": "eip155:1:{identityRegistry}",   // → AVM form: "algorand:<genesisPrefix>:<appId>"
  "agentId": 22,
  "clientAddress": "eip155:1:{clientAddress}",       // → AVM: 58-char Algorand address
  "createdAt": "2025-09-23T12:00:00Z",
  "value": 100,
  "valueDecimals": 0,
  // ALL OPTIONAL
  "tag1": "foo", "tag2": "bar",
  "endpoint": "https://agent.example.com/GetPrice",
  "mcp":  { "tool": "ToolName" },
  "a2a":  { "skills": ["…"], "contextId": "…", "taskId": "…" },
  "oasf": { "skills": ["…"], "domains": ["…"] },
  "proofOfPayment": {
    "fromAddress": "0x00...", "toAddress": "0x00...",
    "chainId": "1", "txHash": "0x00..."
  }
}
```

**Two findings that matter for our schema ownership:**

1. **Canonical `proofOfPayment` carries only `{fromAddress, toAddress, chainId, txHash}`** — a pointer,
   *not* a comparison. It has **no** quoted/settled/asset/payTo fields, and the spec says nothing
   normative beyond this example. So our §7.1 same-chain extension
   `{from, to, asset, amount, txid, round, nonce}` is **ours to define** (legitimately — the spec
   leaves it open). Recommend namespacing the non-canonical extras under an `"x402": {…}` sub-key so
   the object still round-trips for any pure-ERC reader:
   ```jsonc
   "proofOfPayment": {
     "fromAddress": "<payer>", "toAddress": "<payTo>",
     "chainId": "algorand:<genesisPrefix>", "txHash": "<52-char base32 txid>",
     "x402": { "quotedAmount": "1000000", "settledAmount": "1500000",
               "asset": "<ASA-id|ALGO>", "scheme": "exact", "x402Version": "v2" }
   }
   ```
2. **"FeedbackAuth" is a phantom.** Several blogs reference a `feedbackAuth` structure; it is **not** in
   the live EIP. Do not build against it.

**Action:** pin Shayaun's off-chain `uri` payload to this envelope (AVM identifier forms) → spec-compatible for free.

---

## 3. x402 v1 ↔ v2 version drift — PIN ONE VERSION BEFORE THE PAYMENT LANE CODES

Not noted anywhere in our docs, and it gates Navid's lane + Shayaun's `price_match`:

| Concern | v1 (2025-10-03) | v2 (2025-12-09) |
|---|---|---|
| Quote object field for amount | `maxAmountRequired` | **`amount`** |
| Settled-amount field in settle response | (not explicit) | **`amount` = "actual amount settled in atomic units"** ← *new* |
| Request headers | `X-PAYMENT` / `X-PAYMENT-RESPONSE` | `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` / `PAYMENT-REQUIRED` |
| Where requirements live | 402 response body | `PAYMENT-REQUIRED` header |

**Why it gates us:** Shayaun's `price_match = settled <= quoted` depends on a **settled-amount** field
that is **v2-only**. → **Pin x402 v2.** Confirm the Algorand-native facilitator we're using emits the
v2 settle-response shape (with `amount`); if it only speaks v1, the settled amount must be read from
the settlement txn itself.

Also verified: x402 cleanly splits **`POST /verify`** (checks authorization, no broadcast) from
**`POST /settle`** (broadcasts, returns the on-chain txid). That split is what makes
proof-of-payment a *precondition* to writing reputation. **Nuance:** the `SettleResponse` is an
off-chain facilitator JSON that *references* an on-chain tx (`transaction` txid + CAIP-2 `network`);
it is on-chain-*verifiable*, not on-chain *data* unless we box it. (Relevant to §5 below.)

---

## 4. The numbers behind the §7.5 "emit-only vs also-store" sub-choice

Our doc flags the choice but doesn't quantify it. The two hard limits:

- **Box MBR** = `2500 + 400·(len(key) + size)` µAlgos, charged to the app account, reclaimed on delete.
  Worked: a txid-keyed feedback row (40-byte key + ~200-byte value) ≈ **98,500 µAlgos ≈ 0.0985 ALGO**,
  paid by the writer → doubles as anti-spam. (Per-op `box_put` is capped at 4KB; rows >4KB need
  chunked `box_extract`/`box_replace` — keep a row ≤4KB.) Box max size = 32KB.
- **`log` budget** = **≤1024 bytes total / ≤32 `log` calls per program** (AVM `log` opcode `0xb0`,
  cost 1). ARC-28 structured events ride on `log`.

**Implication:** the full proof record (quote + settle + delta) does **not** fit the 1024-byte log
budget alongside other event data → **box = system of record; log/ARC-28 = the small notification
stream** (`{agentId, txid, …}`) the indexer subscribes to. This is the concrete basis for choosing
"also-store in box" over "emit-only" when the row must carry the x402 enrichment.

Global state (64 KV / 8KB) and local state (16 KV / 2KB) confirmed too small for an unbounded
per-feedback proof set — boxes are the only fit (already the mapping doc's choice).

---

## 5. The one design disagreement — and how it resolved

**My research recommendation (4):** compute price-vs-quote **on-chain** via `gtxn` on the settlement
txn inside the atomic group, and store the delta on-chain — so "objective on-chain signal" is literal.

**Team's committed decision (overrides):** off-chain. Mapping §7.4 lists "❌ on-chain settlement
verification … no `gtxn` inspection" as an explicit **non-goal**; Shayaun's `validation.js` computes
`price_match` off-chain in the router; the facilitator owns settlement verification.

**Resolution — defer to the team.** For the MVP and for ERC-spirit (payments orthogonal; facilitator
verifies), off-chain is the right call. I withdraw the push. **One nuance to keep in the back pocket:**
the pitch line "quoted-vs-settled becomes an *objective on-chain* signal" is, with off-chain
verification, strictly *on-chain-anchored, off-chain-verified*. If a judge presses on "objective
on-chain," the `gtxn` same-group check (our own §7.5 opt-in) makes the claim literal — keep it as a
**one-line stretch, not MVP scope**. The cleanness argument for Algorand still holds either way: the
settlement txn sits in the *same atomic group* as the reputation write, so the data is *available* to
read on-chain even if we choose not to.

---

## 6. The four-dimension synthesis (the original research answer, condensed)

1. **On-chain structures.** Feedback today = `(int128 value, uint8 valueDecimals, tag1, tag2,
   feedbackURI, bytes32 feedbackHash)`; Identity = ERC-721/ARC-72. x402 enrichment appends a **quote**
   group (`amount`/`maxAmountRequired`, `asset`, `payTo`, `network`) and a **settlement** group
   (`success`, `transaction` txid, `network`, `payer`, settled `amount`). On Algorand: ARC-72 NFT,
   box rows keyed per logical tuple, native `keccak256`, ARC-28 `log` events.
2. **Entity/relationship model.** The **settlement becomes a first-class entity**; feedback demotes
   from a standalone self-asserted record to a **derivative of a verifiable payment** —
   `agent → settlement → feedback`, joined by `payTo`/`asset`/`network` and the `txid`. Feedback can
   no longer dangle; every edge into it is anchored to a payment that cleared.
3. **Signal/information shape.** Payment-gating turns the write population from "anyone" into "clients
   who actually paid," moving Sybil cost from ~free to `N × price` ("verified purchase"). Quoted-vs-
   settled becomes a number derivable from protocol fields rather than a reviewer's opinion — the
   reputation entry shifts from *testimony* to *receipt*.
4. **Storage/cost & access.** Boxes (32KB; MBR `2500+400·(len+size)`) hold the rich rows; atomic
   groups make "settle + write" indivisible; reads are off-chain via algod `GetApplicationBoxes` /
   indexer + ARC-28 logs (on-chain, only the owning app reads its boxes). Replaces EVM's
   mapping+events query model with box+log+indexer.

---

## 7. Net actions handed to the lanes

- **Shayaun (reputation/validation):** pin the off-chain `uri` payload to the §2 envelope (AVM
  identifier forms); namespace x402 extras under `proofOfPayment.x402`; keep `price_match` off-chain
  (confirmed correct); box = record, ARC-28 = notification.
- **Navid (payment):** **pin x402 v2** (settled-amount field is v2-only); confirm the Algorand
  facilitator emits the v2 settle shape; surface `settledAmount` + `quotedAmount` to the router.
- **Reza (identity/discovery/ranking):** ranking reads come from indexer/box reads + ARC-28; agentId
  is `uint64` (mapping §5 delta), not uint256.
- **Doc owner:** optionally fold §2–§4 into `ERC8004_AVM_MAPPING.md` as a `§8 addendum` once the repo
  restructure settles (this file is a standalone record meanwhile).

---

## Sources (all primary unless noted)

- EIP-8004 (raw): https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-8004.md
- EIP-8004 (rendered): https://eips.ethereum.org/EIPS/eip-8004
- erc-8004-contracts: https://github.com/erc-8004/erc-8004-contracts
- x402 v1 spec: https://github.com/coinbase/x402/blob/main/specs/x402-specification-v1.md
- x402 v2 spec: https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md
- x402 HTTP 402 docs: https://docs.x402.org/core-concepts/http-402
- ARC-72 (smart-contract NFT): https://arc.algorand.foundation/ARCs/arc-0072
- ARC-19 (mutable metadata): https://github.com/algorandfoundation/ARCs/blob/main/ARCs/arc-0019.md
- ARC-28 (event log): https://dev.algorand.co/arc-standards/arc-0028/
- Box storage: https://dev.algorand.co/concepts/smart-contracts/storage/box/
- State limits: https://developer.algorand.org/docs/get-details/dapps/smart-contracts/apps/state/
- AVM opcodes (keccak256, log): https://dev.algorand.co/reference/algorand-teal/opcodes/
- Atomic groups: https://dev.algorand.co/concepts/transactions/atomic-txn-groups/
- (blog, context only) ERC-8004 × x402: https://www.smartcontracts.tools/blog/erc8004-x402-infrastructure-for-autonomous-ai-agents/
