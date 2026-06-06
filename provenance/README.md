# Liminal × Algorand — provenance + x402 agent commerce

Liminal's Algorand integration for the **Algorand Builders Berlin: Agentic Commerce x402**
hackathon. Two layers on **one Algorand substrate**, plus the **correction loop** that runs on top:

1. **Provenance** — sign a local packet → canonical hash → anchor the hash on Algorand → store the
   receipt back in the vault → anyone can verify the packet existed, unaltered, **without seeing its
   content**. Hash-only on chain.
2. **x402 agent commerce** — bounded agents transact with each other over the x402 payment protocol,
   with a **structural guard**: an agent serves and charges only for in-lane work; out-of-lane work
   is refused for free, naming the right agent. You cannot be charged for work an agent has no
   business doing. A paid delivery is then **provenance-anchored** — paid here, proven here.
3. **Correction loop** — the Liminal primitive on top of both layers. A read can be **corrected** by
   the user: corrections are first-class, typed data (`inner` / `outer` / `cross` / `emergence`, with
   `emergence` kept **local** — never projected outward). The corrected re-read is re-anchored and
   carries a **different hash** — the loop does not converge. Every settle / serve / anchor / refusal
   is recorded in an append-only vault event log.

Runs with **zero external services by default** (an in-memory mock chain). Switch to **AlgoKit
LocalNet** or **public testnet** with one env var.

```bash
npm install            # devDeps + optional algosdk (algosdk only needed for real networks)
npm test               # 47 tests — provenance + x402 + correction stream + audit (mock backends, no network)
npm run typecheck

npm run demo           # provenance:  sign → anchor → verify (prints on-chain bytes: hash only)
npm run demo:x402      # x402:        in-lane paid call (settles + anchors) · out-of-lane refused free
npm run demo:loop      # the loop:    drop → read (settle+anchor) → correct → sign (re-anchor) + audit ribbon

# real networks
algokit localnet start && LIMINAL_ALGO_NETWORK=localnet npm run demo:x402
LIMINAL_ALGO_NETWORK=testnet npm run demo:x402     # generates .algo-testnet-account.json; fund it once
LIMINAL_ALGO_NETWORK=testnet npm run demo:loop     # the full correction loop on public testnet
```

## Layer 1 — Provenance

| Concern | File |
|---|---|
| Canonical packet serialization | [`src/canonical.ts`](src/canonical.ts), [`src/packet.ts`](src/packet.ts) |
| Algorand anchor adapter | [`src/chain/algorand.ts`](src/chain/algorand.ts), [`src/chain/mock.ts`](src/chain/mock.ts) |
| Vault receipt fields | [`src/vault.ts`](src/vault.ts), [`migrations/008_packet_anchor_receipt.sql`](migrations/008_packet_anchor_receipt.sql) |
| Verifier utility | [`src/verify.ts`](src/verify.ts), [`bin/demo.ts`](bin/demo.ts) |

Receipt stored back on each packet: `packet_hash · canonical_version · anchor_txn_id · anchored_at ·
chain · network · verifier metadata`.

**Three guarantees, each tested:**

- **Hash stability** — the same logical packet always hashes the same, regardless of JSON key order,
  agent-read array order, or Unicode normal form. A pinned golden vector fails loudly if the
  serialization ever drifts (drift would silently invalidate every past anchor).
- **Privacy** — anchoring publishes a note containing **only** `{schema, canonical_version,
  packet_hash}`. Tests inspect the raw note bytes and assert no content leaks and that note size is
  independent of packet size.
- **Independent verification** — a third party recomputes the hash from a shared packet and matches
  it on the public chain, using only the packet + txn id + chain read access. No vault, no keys. One
  changed character is rejected.

Design: **selective per-packet anchoring** (anchoring is an explicit act, not automatic) on
Algorand (≈$0.0001/txn, instant finality, 1KB note, permissionless verification). **Anchor ≠
backup** — the chain proves existence; recovering content needs the vault. Agents never read the
chain.

## Layer 2 — x402 agent commerce

| Concern | File |
|---|---|
| Protocol types + v2 headers | [`src/x402/types.ts`](src/x402/types.ts) |
| Payer + Facilitator (verify / settle) | [`src/x402/facilitator.ts`](src/x402/facilitator.ts) |
| Bounded agents + lane guard | [`src/x402/agent.ts`](src/x402/agent.ts) |
| Priced endpoint (the 402 gate) | [`src/x402/gate.ts`](src/x402/gate.ts), [`bin/x402-demo.ts`](bin/x402-demo.ts) |

The flow, per request to a priced agent:

1. **Structural guard first.** Out-of-lane → `200` **free refusal**, names the right agent, no
   settlement. This is the commerce-rogue prevention: an agent can't bill for work outside its lane.
2. **In-lane, unpaid** → `402 PAYMENT-REQUIRED` with machine-readable requirements.
3. **In-lane, paid** → the payer signs an authorization; the facilitator **verifies** it
   (receiver, amount, asset, resource/nonce binding, replay) and **settles** it on-chain; the read
   is served and the delivered packet is **anchored** via Layer 1.

Settlement guarantees are tested: underpayment, wrong receiver, wrong asset, resource/nonce binding
mismatch, and replay are each rejected.

### Aligned to the official Algorand reference

This layer is shaped to the Algorand Foundation's official **`algorandfoundation/x402-demo`** (the
`@x402-avm` packages): scheme **`exact`**, **CAIP-2** network ids (`algorand:<genesisHash>`), the
**`PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`** header trio, and the
**client-signs / facilitator-submits** two-phase **verify → settle** model. Full side-by-side and
the reconciliation log: [`docs/X402_OFFICIAL_COMPARISON.md`](docs/X402_OFFICIAL_COMPARISON.md).

The Liminal additions on top of the standard are the **settlement-refusal guard** and the
**provenance anchor of the delivered packet** — the agentic-commerce-with-receipts story.

For a production entry, the cleanest path is to depend on `@x402-avm/*` directly (a `@x402-avm/hono`
resource server per agent, pointed at a facilitator) and run our guard + anchor as middleware/hooks;
this slice is the self-contained, offline-runnable reference that shows we implement the protocol
correctly.

## The correction loop — drop → read → correct → sign

The Liminal primitive, running on both layers above. Lifted from the Notion-hackathon entry
(`liminal-notion-hack`) and wired onto the x402 + provenance substrate here.

| Concern | File |
|---|---|
| Append-only vault event log (hash-only) | [`src/vault.ts`](src/vault.ts) |
| Correction stream + projection gate | [`src/correction.ts`](src/correction.ts), [`src/projection.ts`](src/projection.ts) |
| Per-call audit wrapper + decision tags | [`src/audit.ts`](src/audit.ts), [`src/decision-tags.ts`](src/decision-tags.ts) |
| Refusal recorded as an event | [`src/x402/gate.ts`](src/x402/gate.ts) |
| End-to-end loop demo | [`bin/loop-demo.ts`](bin/loop-demo.ts) |

- **Correction is first-class.** When the user disagrees with a read, the correction is recorded as a
  typed vault event (`inner` / `outer` / `cross` / `emergence`) pointing at the `packet.anchored`
  event it corrects — not an overwrite, not an error.
- **Emergence stays local.** An `emergence` correction (a read the system did not offer) is recorded
  but never projected across a boundary — enforced by one projection gate.
- **The loop does not converge.** The corrected re-read is re-signed and re-anchored; its hash differs
  from the first read's. Sharper reads produce deeper corrections, not fewer.
- **Everything is auditable.** Each settle / serve / anchor emits exactly one `agent.call` event; each
  free refusal emits a `lane.refusal` event. `npm run demo:loop` prints the append-only ribbon.

## Scope notes

- **Provenance hashing** commits to the full packet; only the hash is anchored. **No ed25519 packet
  signature** yet — "sign" here is the canonical hash commitment.
- **No sponsored (gasless) fees.** The official `ExactAvmScheme` can sponsor fees via fee-pooling;
  we implement payer-pays and treat sponsored fees as the upstream extension.
- **Explicit asset field** on requirements (ALGO or ASA id); the official resolves the asset from a
  `$` price through the scheme's USDC config.
