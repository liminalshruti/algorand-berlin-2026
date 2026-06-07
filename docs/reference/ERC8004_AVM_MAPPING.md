# ERC-8004 → AVM 1:1 Mapping

**Source:** ERC-8004 *Trustless Agents* (Draft, 2025-08-13) — Identity / Reputation / Validation registries.
**Target:** Algorand Virtual Machine (AVM ≥ v10), ARC standards.
**Date:** 2026-06-06 · **For:** Algorand Berlin hack day · **Status:** spec-port reference (build against this).

This is a **construct-by-construct port**, not the positioning story. For the current product framing,
use `README.md` and `docs/pitch/`. Goal: every EVM primitive in the spec has exactly one AVM counterpart, so
the three Ethereum contracts become three Algorand applications with no semantic drift.

---

## 0. Primitive substitution table (applies everywhere)

| ERC-8004 / EVM primitive | AVM equivalent | Notes |
|---|---|---|
| Solidity contract | Algorand **Application** (one app id) | 3 contracts → 3 apps (Identity, Reputation, Validation) |
| `ERC-721` + `URIStorage` | **ARC-72** (smart-contract NFT) | ARC-72 mirrors 721: `ownerOf`, `transferFrom`, `approve`, `setApprovalForAll`, `balanceOf`, `tokenURI`. NOT an ASA — ASAs lack programmable transfer hooks |
| `tokenId` (uint256) | `uint64` agentId | AVM has no uint256; incremental counter fits uint64. ARC-72 token id is uint256 by spec but we constrain to uint64 range |
| `tokenURI` | `agentURI` string in **box** | keyed `b"uri:" + agentId` |
| EVM `address` (20 bytes) | Algorand `address` (32 bytes, ed25519 pubkey) | all `clientAddress` / `validatorAddress` / `agentWallet` / owner |
| `mapping(...)` storage | **box storage** | one box per logical row; key = concatenated tuple |
| Solidity `event` | **ARC-28** event log (`log` opcode) | selector = first 4 bytes of `sha512_256("EventName(types)")`; args ARC-4 encoded |
| `keccak256` | `keccak256` opcode | **native on AVM** — `feedbackHash` / `responseHash` / `requestHash` stay keccak-256, 1:1 |
| `EIP-712` typed-data sig (EOA) | **ARC-60** `algorand_signData` + `ed25519verify_bare` | structured-data signing analog |
| `ERC-1271` (contract-wallet sig) | app-account / **logicsig** verification | see §1.5 — no native 1271; use method-call or logicsig auth |
| `EIP-155` chainId | **CAIP-2** `algorand:<genesisHashPrefix>` | MainNet = `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k` |
| `view` function | **ARC-22** readonly ABI method (or `simulate`) | no gas; off-chain read |
| `int128` (signed fixed-point) | ARC-4 `byte[16]` two's-complement (or `uint128`+sign) | AVM math is uint64; encode/decode at the ABI boundary |
| `uint8` / `uint64` | ARC-4 `uint8` / `uint64` (native) | 1:1 |
| Singleton per chain | one app id per network | published in deployment manifest |
| EIP-7702 gas sponsorship | **fee pooling** in the atomic group | relayer pays the client's txn fee — no client ALGO needed |

**Global identifier port.** ERC-8004 `agentRegistry = {namespace}:{chainId}:{identityRegistry}`
(`eip155:1:0x742...`). AVM form: `{namespace}:{caip2-ref}:{appId}` →
`algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k:1234567` where `1234567` is the Identity app id. The
namespace becomes `algorand` (CAIP-2), the chainId becomes the genesis-hash prefix, the registry
address becomes the **app id** (not an account address — the app *is* the registry).

---

## 1. Identity Registry → ARC-72 Application

ERC-721+URIStorage → a single ARC-72 app holding all agents. `tokenId`→`agentId` (uint64),
`tokenURI`→`agentURI`.

### 1.1 State layout

| Datum | EVM | AVM box / global |
|---|---|---|
| next agent id | implicit counter | global `b"nextId"` (uint64) |
| owner of agentId | ERC-721 `_owners` | box `b"own:"+agentId` → address |
| agentURI | URIStorage | box `b"uri:"+agentId` → string (incl. `data:` URIs, up to 32KB/box) |
| approvals | ERC-721 `_tokenApprovals` | box `b"apr:"+agentId` → address |
| operator-for-all | `_operatorApprovals` | box `b"opr:"+owner+operator` → bool |
| metadata kv | new in 8004 | box `b"md:"+agentId+key` → bytes |
| agentWallet (reserved) | metadata key `agentWallet` | box `b"md:"+agentId+"agentWallet"` → address |

### 1.2 Functions

| ERC-8004 | ARC-4 / ARC-72 method | Auth | Notes |
|---|---|---|---|
| `register(uri, MetadataEntry[])` | `register(string,(string,byte[])[])uint64` | any | mints agentId, sets uri, sets `agentWallet=caller`, emits events |
| `register(uri)` | `register(string)uint64` | any | overload |
| `register()` | `register()uint64` | any | uri added later |
| `setAgentURI(id,uri)` | `setAgentURI(uint64,string)void` | owner/operator | emits URIUpdated |
| `getMetadata(id,key)` | `getMetadata(uint64,string)byte[]` (readonly) | view | box read |
| `setMetadata(id,key,val)` | `setMetadata(uint64,string,byte[])void` | owner/operator | **reverts if key=="agentWallet"** |
| `setAgentWallet(id,newWallet,deadline,sig)` | `setAgentWallet(uint64,address,uint64,byte[])void` | owner | verifies ARC-60/1271 sig over (id,newWallet,deadline,appId,genesisHash); checks `deadline >= Global.LatestTimestamp` |
| `getAgentWallet(id)` | `getAgentWallet(uint64)address` (readonly) | view | |
| `unsetAgentWallet(id)` | `unsetAgentWallet(uint64)void` | owner | clears box |
| ERC-721 `transferFrom` | `arc72_transferFrom(address,address,uint64)void` | owner/approved | **hook: clears agentWallet box** (re-verify by new owner) |
| ERC-721 `ownerOf`/`balanceOf`/`approve` | `arc72_ownerOf` / `arc72_balanceOf` / `arc72_approve` / `arc72_setApprovalForAll` | per ARC-72 | 1:1 |

### 1.3 Events (ARC-28)

| ERC-8004 event | ARC-28 signature |
|---|---|
| `Registered(uint256,string,address)` | `Registered(uint64,string,address)` |
| `MetadataSet(uint256,string,string,bytes)` | `MetadataSet(uint64,string,string,byte[])` — emit indexed key as separate log per ARC-28 (no native indexed topics) |
| `URIUpdated(uint256,string,address)` | `URIUpdated(uint64,string,address)` |
| ERC-721 `Transfer` | ARC-72 `arc72_Transfer(address,address,uint256)` |

> **Indexed-topic note.** EVM `indexed` params become Ethereum log topics for cheap filtering. AVM
> `log` has no topics. ARC-28 convention: the whole event (selector+args) is one log entry; indexers
> filter on the decoded `agentId` field. Functionally equivalent for subgraph-style indexing; the
> `indexed` keyword is a no-op on AVM.

### 1.4 Registration file

**Unchanged JSON**, except `registrations[].agentRegistry` uses the AVM identifier form:
```jsonc
"registrations": [
  { "agentId": 22, "agentRegistry": "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k:1234567" }
]
```
`type`, `services[]`, `x402Support`, `active`, `supportedTrust[]` are chain-agnostic — keep verbatim.
A `services[]` entry MAY advertise an Algorand address as the agent's on-chain wallet
(`{"name":"algorand-wallet","endpoint":"<58-char addr>"}`). Endpoint domain verification
(`/.well-known/agent-registration.json`) is transport-layer — unchanged.

### 1.5 The ERC-1271 / EIP-712 port (setAgentWallet) — the one real gap

ERC-8004 proves control of a new wallet via EIP-712 sig (EOA) or ERC-1271 (contract wallet). AVM has
neither natively. Port:

- **EOA equivalent (ed25519 keypair):** wallet signs an **ARC-60** structured payload
  `{appId, agentId, newWallet, deadline}` (domain-separated to prevent replay across apps/networks —
  include genesis hash). App verifies with `ed25519verify_bare(data, sig, newWallet_pubkey)`. Since an
  Algorand address *is* the ed25519 pubkey, this is a clean 1:1 for the EOA case.
- **Contract-wallet equivalent (ERC-1271):** Algorand "contract wallets" are app accounts or
  logicsigs, which can't produce an ed25519 sig. Two options:
  1. **Method-call proof:** the new wallet (if an app account) authorizes by having *its* app issue an
     inner-txn app-call to `setAgentWallet` — caller identity (`Txn.Sender`) IS the proof. Replaces
     the signature path entirely for contract wallets.
  2. **Logicsig proof:** the new wallet is a logicsig; control is proven by submitting a 0-amount
     self-payment signed by that logicsig in the same group, which the app inspects via
     `gtxn`. Equivalent to ERC-1271's "the contract attests to the sig."

  Recommend option 1 (cleaner, no group choreography). Document which path an integrator uses.

---

## 2. Reputation Registry → Application

`initialize(identityRegistry_)` → store the **Identity app id** in global `b"idApp"`.
`getIdentityRegistry()` → `getIdentityRegistry()uint64` (readonly) returns that app id.

### 2.1 State layout

Feedback row keyed by `(agentId, clientAddress, feedbackIndex)`.

| Datum | AVM box |
|---|---|
| per-(agent,client) last index | `b"li:"+agentId+client` → uint64 |
| feedback row | `b"fb:"+agentId+client+feedbackIndex` → ARC-4 `(int128 value, uint8 dec, string tag1, string tag2, bool isRevoked)` |
| client set per agent | `b"cl:"+agentId` → address[] (append-on-first-feedback) |
| response count | `b"rc:"+agentId+client+feedbackIndex+responder` → uint64 |

`endpoint`, `feedbackURI`, `feedbackHash` are **emitted, not stored** (1:1 with spec). `keccak256`
opcode produces/validates `feedbackHash` natively.

### 2.2 Functions

| ERC-8004 | ARC-4 method | Auth / checks |
|---|---|---|
| `giveFeedback(id,value,dec,tag1,tag2,endpoint,feedbackURI,feedbackHash)` | `giveFeedback(uint64,byte[16],uint8,string,string,string,string,byte[32])void` | agentId must exist (cross-app read of Identity); `dec ∈ [0,18]`; **caller MUST NOT be owner/operator** of agentId; bumps feedbackIndex |
| `revokeFeedback(id,feedbackIndex)` | `revokeFeedback(uint64,uint64)void` | caller == original clientAddress |
| `appendResponse(id,client,feedbackIndex,responseURI,responseHash)` | `appendResponse(uint64,address,uint64,string,byte[32])void` | **anyone** |
| `getSummary(id,clients[],tag1,tag2)` | `getSummary(uint64,address[],string,string)(uint64,byte[16],uint8)` readonly | `clients` MUST be non-empty (Sybil guard, per spec) |
| `readFeedback(id,client,feedbackIndex)` | `readFeedback(uint64,address,uint64)(byte[16],uint8,string,string,bool)` readonly | |
| `readAllFeedback(...)` | `readAllFeedback(uint64,address[],string,string,bool)(...)` readonly | revoked omitted by default |
| `getResponseCount(...)` | `getResponseCount(uint64,address,uint64,address[])uint64` readonly | |
| `getClients(id)` | `getClients(uint64)address[]` readonly | |
| `getLastIndex(id,client)` | `getLastIndex(uint64,address)uint64` readonly | |

> **Cross-app validity check.** "agentId must be a validly registered agent" → the Reputation app
> reads the Identity app's `b"own:"+agentId` box (foreign app + box reference in the txn) to confirm
> existence and to check owner/operator for the self-feedback prohibition. Foreign-app box reads need
> the box + app declared in the transaction's reference arrays.

### 2.3 Events (ARC-28)

| ERC-8004 | ARC-28 signature |
|---|---|
| `NewFeedback(...)` | `NewFeedback(uint64,address,uint64,byte[16],uint8,string,string,string,string,byte[32])` |
| `FeedbackRevoked(uint256,address,uint64)` | `FeedbackRevoked(uint64,address,uint64)` |
| `ResponseAppended(...)` | `ResponseAppended(uint64,address,uint64,address,string,byte[32])` |

### 2.4 int128 signed fixed-point — the type port

`value` is `int128` (can be negative, e.g. `tradingYield -32`). AVM integer math is uint64 only.
Port:
- **Wire/storage:** ARC-4 `byte[16]`, two's-complement big-endian (matches Solidity int128 layout).
- **On-chain aggregation** (`getSummary` sum): if you need on-chain summation, decode to sign+magnitude
  and use `b+`/`b-`/`b*` (byte-wise bigint opcodes) which operate on arbitrary-width unsigned
  byte strings — handle sign separately. If on-chain aggregation isn't required (spec says complex
  aggregation happens off-chain), store/emit opaquely and let indexers do the math. **Recommend the
  latter** for the hack: store `byte[16]`, emit, aggregate off-chain. `getSummary` returns count +
  a simple on-chain sum only when all values share sign (the common case for `starred`/`uptime`).

### 2.5 Client-as-agent feedback

Spec: when the client is itself an agent, use the agent's `agentWallet` as `clientAddress`. AVM: the
calling agent sends the `giveFeedback` txn from the address stored in its Identity-app `agentWallet`
box. No protocol change — convention enforced by the caller.

---

## 3. Validation Registry → Application

Same `initialize` / `getIdentityRegistry` pattern as §2.

### 3.1 State layout

Keyed by `requestHash` (bytes32, keccak-256 commitment).

| Datum | AVM box |
|---|---|
| request/response record | `b"vr:"+requestHash` → ARC-4 `(address validator, uint64 agentId, uint8 response, byte[32] responseHash, string tag, uint64 lastUpdate)` |
| agent→requests index | `b"av:"+agentId` → byte[32][] (append) |
| validator→requests index | `b"vq:"+validator` → byte[32][] (append) |

### 3.2 Functions

| ERC-8004 | ARC-4 method | Auth / checks |
|---|---|---|
| `validationRequest(validator,agentId,requestURI,requestHash)` | `validationRequest(address,uint64,string,byte[32])void` | caller MUST be owner/operator of agentId; stores validator+agentId keyed by requestHash |
| `validationResponse(requestHash,response,responseURI,responseHash,tag)` | `validationResponse(byte[32],uint8,string,byte[32],string)void` | caller MUST == `validator` from the request; `response ∈ [0,100]`; **callable multiple times** (progressive finality) → overwrite record, update `lastUpdate=Global.LatestTimestamp` |
| `getValidationStatus(requestHash)` | `getValidationStatus(byte[32])(address,uint64,uint8,byte[32],string,uint64)` readonly | |
| `getSummary(agentId,validators[],tag)` | `getSummary(uint64,address[],string)(uint64,uint8)` readonly | count + average response |
| `getAgentValidations(agentId)` | `getAgentValidations(uint64)byte[32][]` readonly | |
| `getValidatorRequests(validator)` | `getValidatorRequests(address)byte[32][]` readonly | |

### 3.3 Events (ARC-28)

| ERC-8004 | ARC-28 signature |
|---|---|
| `ValidationRequest(address,uint256,string,bytes32)` | `ValidationRequest(address,uint64,string,byte[32])` |
| `ValidationResponse(address,uint256,bytes32,uint8,string,bytes32,string)` | `ValidationResponse(address,uint64,byte[32],uint8,string,byte[32],string)` |

`response` is `uint8` 0–100 (binary or spectrum) — native ARC-4 `uint8`, 1:1. Validator backends
(stake-secured re-execution, zkML, TEE oracle) are off-chain and unchanged; only the on-chain
recording surface is ported. Incentives/slashing out of scope per spec.

---

## 4. Cross-cutting concerns

| ERC-8004 rationale point | AVM realization |
|---|---|
| **Gas sponsorship (EIP-7702):** clients need no registration/gas | **Fee pooling:** a relayer adds itself to the atomic group and pays the client's `giveFeedback` fee. Client needs 0 ALGO. Even stronger than 7702 — works today, no account abstraction |
| **Indexing (subgraphs over on-chain + IPFS):** | ARC-28 logs are indexed by Algorand indexer / subgraph equivalents (e.g. Subsquid Algorand); IPFS URIs unchanged |
| **Deployment: singletons per chain** | one app id per network; publish `{network → appId}` manifest. Agent on app A can transact on any chain (app ids are network-local; the CAIP-2 ref disambiguates) |
| **On-chain pointers immutable** | boxes are mutable by app logic, but events (logs) are in the immutable ledger → audit trail integrity preserved via ARC-28 logs, exactly as EVM event logs |
| **Content-addressed hash optional for IPFS** | identical: `feedbackHash`/`responseHash` = `bytes32(0)` for IPFS, keccak-256 otherwise. AVM keccak256 opcode covers the non-IPFS case |

---

## 5. The four genuine non-1:1 deltas (call these out honestly)

1. **No indexed event topics.** EVM `indexed` params → topic-based log filtering. AVM `log` has no
   topics; ARC-28 emits the whole event and indexers filter decoded fields. *Functionally equivalent,
   structurally different.* Cheap topic-only filters become full-log scans for the indexer.

2. **ERC-1271 has no native analog.** Contract-wallet signature validation (`setAgentWallet`) must be
   re-expressed as a method-call or logicsig-auth pattern (§1.5). EOA/EIP-712 ports cleanly via ARC-60
   + `ed25519verify_bare`; the contract-wallet case changes shape.

3. **uint256 → uint64 for agentId.** ARC-72 nominally uses uint256 token ids; we constrain agentId to
   uint64 (incremental, never exhausted in practice). `requestHash`/`feedbackHash` stay full 32-byte
   via `byte[32]`. Only the *id counter* narrows.

4. **int128 signed math.** No native signed/128-bit arithmetic. `value` ports as `byte[16]`
   two's-complement; on-chain aggregation needs explicit sign handling via bigint byte opcodes, or
   (recommended) defer aggregation off-chain. The *storage and emission* are 1:1; the *on-chain math*
   is the only place AVM's uint64-native model leaks through.

Everything else — three registries, all functions, all events, all hashes (keccak-256 native!),
identity-via-NFT, URIStorage, metadata kv, reserved agentWallet with transfer-clear semantics,
self-feedback prohibition, Sybil-guard on `getSummary`, progressive validation — ports **1:1**.

---

## 6. Build order for the hack (maps to scope §4 layers)

1. **Identity app (ARC-72 + metadata + agentWallet).** Boxes, `register`, `setAgentURI`,
   `setMetadata`/`getMetadata`, reserved-key guard, transfer hook clearing agentWallet. ARC-28 events.
2. **Reputation app.** `initialize`/`getIdentityRegistry`, `giveFeedback` (with cross-app validity +
   self-feedback prohibition), `revokeFeedback`, `appendResponse`, readonly reads. Defer int128
   aggregation off-chain.
3. **Validation app.** `validationRequest`/`validationResponse` (multi-call progressive finality),
   readonly summaries.
4. **Indexer + manifest.** ARC-28 decoder → the trust-router's reputation read (scope §5 layer 5).

This is the on-chain spine the x402 trust router (scope §3 hack delta) reads from at routing time and
writes back to after validation.

---

## 7. x402 profile (optional) — tailoring the port for the x402 trust-router

**Status:** additive profile over §2–§3. Methods keep their semantics / auth / shape **1:1 with the
ERC**, with **one deliberate exception**: in this profile `giveFeedback` makes the x402 payment reference
**mandatory** (§7.1). Strip the profile and the registries are pure ERC-8004 again. This section covers
the Reputation and Validation registries (the x402-relevant ones); Identity (§1) is unchanged.

**Principle.** ERC-8004 keeps payments **orthogonal** — *"payments are out of scope… examples show how
x402 can enrich feedback."* Anyone may give feedback (only self-feedback is blocked); validation carries
no funds (incentives/slashing out of scope per §3.3). So this profile **never gates, escrows, or polices
payment.** It makes the port **x402-ergonomic**: the payment proof rides along as optional enrichment and
the trust-router reads/correlates it cheaply. The one AVM-native lever — x402 settles on the **same
Algorand ledger** the registries live on (see `apps/router/src/context.ts` and
`apps/router/src/pay.ts`), so "proof of payment" stops being a foreign opaque hash (EVM
`{chainId, txHash}`) and becomes a same-chain, natively-verifiable reference.

### 7.1 Reputation registry

**Unchanged (1:1, per §2):** self-feedback prohibition via cross-app Identity read; `revokeFeedback` /
`appendResponse`; stored `{value, valueDecimals, tag1, tag2, isRevoked}`; Sybil-guarded
`getSummary(clients[], …)`. **No on-chain payment verification, custody, or gating.**

**Mandatory x402 fields on `giveFeedback` (the one deliberate deviation):**

`giveFeedback` extends the ERC signature (§2.2) with **mandatory** same-chain payment fields:

| Field | Type | Role |
|---|---|---|
| `paymentTxid` | `byte[32]` | the x402 settlement txid, on the **same** Algorand ledger as the registry |
| `nonce` | `uint64` | the x402 challenge nonce (correlation / dedup key for the indexer) |

The contract `require`s them present (non-zero) and **records + emits** them in `NewFeedback`. It does
**not** verify the settlement on-chain — the facilitator already did that off-chain (`algorand.js`
`settle()` checks receiver / amount / replay), and payments stay orthogonal to the registry. So this is a
**mandatory reference, not on-chain enforcement**: every review is anchored to a real same-chain payment,
but the registry never inspects funds, runs `gtxn`, or escrows.

> **Why deviate from ERC "all fields except value/valueDecimals optional."** For the x402 trust-router an
> unpaid review is meaningless, so a payment anchor is a first-class precondition of feedback — not
> optional enrichment. This is the profile's single signature change; everything else in §2 is untouched.
> (Honest delta, in the spirit of §5.)

**Other x402 tailoring (convention-only, no contract change):**

| Tailoring | What | In-spirit because |
|---|---|---|
| Same-chain `proofOfPayment` | off-chain feedback-file field specialized `{fromAddress,toAddress,chainId,txHash}` → `{from,to,asset,amount,txid,round,nonce}`; resolvable from `paymentTxid` since same-chain | spec explicitly invites a `proofOfPayment` field |
| Tag convention | `tag1="x402"` marks payment-backed feedback; `value`/`valueDecimals` may carry the paid amount | `tag1`/`tag2` are developer-discretion; the §2 example table has money signals (`revenues`, `tradingYield`) |
| `clientAddress` = x402 payer | convention | parallels the spec's "client-as-agent uses `agentWallet`" (§2.5) |

> **Verified-purchaser reviews.** The router reads stock `getSummary(agentId, payers[], "x402", …)` —
> Sybil-guarded, unchanged. Payment is **mandatory at write** (the ref must be supplied) and **verified
> off-chain at read** (the indexer/facilitator confirms the txid really settled to the agent's wallet).

**Open sub-choices (these do *not* reopen the mandatory decision):**
- **emit-only vs also-store** the ref — store it in the feedback row only if `readFeedback` must return it
  on-chain; otherwise emit-only keeps storage lean (matches how §2.1 treats `feedbackURI`/`feedbackHash`).
- **lean `paymentTxid`+`nonce` vs full `proofOfPayment` tuple** as the mandatory params — lean relies on
  the indexer to resolve `{from,to,asset,amount,round}` from the same-chain txid; the tuple makes rows
  self-contained at higher calldata/storage cost.
- **opt-in on-chain verification** — if the contract should ever confirm settlement itself, add a `gtxn`
  same-group check as an *option*; noted only — it's the heavier path steered away from earlier, and is
  not part of this plan.

### 7.2 Validation registry

**Unchanged (1:1, per §3):** `validationRequest` (owner/operator), `validationResponse` (only the named
validator; `0–100`; multi-call progressive finality), readonly summaries. **No fund movement.**

**x402-tailored (additive, optional):**

| Tailoring | What | Contract surface |
|---|---|---|
| `requestURI`/`requestHash` payload carries x402 context | the paid task's settlement ref + delivered output go in the request payload the validator already consumes; `requestHash` (native keccak) commits to it | **none** |
| `tag` carries x402 / finality context | `tag="x402:settled"`, soft/hard finality stages | **none** (spec already allows `tag`) |
| Optional emitted ref in `ValidationRequest` | same minimal additive choice as §7.1, so the router correlates paid-task → validation outcome | **+1 optional emitted field** |

For the trust-router demo, hidden fees are **automatic validation**, not `giveFeedback`: discovery keeps
minimal listing metadata (`service_id`, `provider_id`, `quote_id`, amount, asset, `payTo`,
`observed_at`, `expires_at`), the quote policy layer pins a fresh listing into an active quote
commitment, the x402 payment settles, and the router compares quote/challenge/settlement before
anchoring a validation result. User satisfaction feedback remains separate and uses `giveFeedback` when
enabled. Future active validation can let providers ask validators to test a service and earn
reputation via attestations, including optional zero-knowledge proofs.

### 7.3 Cross-cutting — the x402 router loop

| Concern | Realization (in-spirit) |
|---|---|
| Join payment ↔ automatic validation ↔ user feedback | the off-chain x402 `nonce`/`txid` is the **correlation key** the indexer stitches on — read-side only; nothing on-chain requires it |
| Client needs no ALGO to leave feedback | **fee-pooling** (§4): the x402 atomic group sponsors the client's `giveFeedback` fee — maps to the ERC's EIP-7702 gas-sponsorship rationale |
| Routing-time read | readonly `getSummary` (already in §2) filtered by the `x402` tag |
| `value` type for money signals | x402 amounts (µALGO / USDC base units) fit `uint64` → for the x402 case prefer the uint64 path and sidestep the `int128`/`byte[16]` aggregation of §2.4 |

### 7.4 Non-goals (explicit — these would break ERC spirit)

The payment **reference** is mandatory on `giveFeedback` (§7.1); the payment **mechanism** stays out of
the registry. The line is "require the ref, don't verify/move the funds":

- ❌ on-chain settlement **verification** in the registry — no `gtxn` inspection of the payment; the
  facilitator verifies settlement off-chain (`algorand.js` `settle()`).
- ❌ payment-**gated** acceptance beyond requiring the ref — the contract requires a `paymentTxid` to be
  *supplied*, not that it *prove real* before recording.
- ❌ escrow / custody / inner-txn fund release inside the registries — payments orthogonal.
- ❌ on-chain anti-replay as a gate — the facilitator owns replay (`settledTxids` / `usedNonces`);
  `nonce` is recorded for the indexer's correlation/dedup, not enforced by the contract.

### 7.5 Net delta vs §2–§3

1. `giveFeedback` gains **mandatory** payment fields (`paymentTxid: byte[32]`, `nonce: uint64`),
   recorded + emitted in `NewFeedback`, **not** on-chain-verified — the profile's one signature deviation;
2. `ValidationRequest` gains an **optional** emitted payment ref (§7.2 — validation stays optional; only
   `giveFeedback` is mandatory);
3. a **same-chain** `proofOfPayment` shape in the off-chain files;
4. an **x402 tag convention** (`tag1="x402"`, `tag="x402:settled"`);
5. a note to prefer the **uint64** path for x402 amounts.

Everything else in §2–§3 is untouched. The registries remain a faithful ERC-8004 port except for the
single mandatory-payment-ref deviation on `giveFeedback`; x402 is a profile on top, not a fork.
