# Berlin submission spine decision

**Status:** decided for execution  
**Date:** 2026-05-30  
**Decision:** submit the runnable Berlin slice as the judged demo spine.

## Decision

The judged submission spine is:

> `hackathons/algorand-berlin-2026`

This repo contains the runnable proof path: provenance signing, x402 settlement, bounded free refusal, correction stream, hash-only Algorand anchoring, verifier flow, and the full drop -> read -> correct -> sign demo.

`liminal-agents#40` is the product-integration companion, not the primary judged repo until its real-network endpoint path is verified. It should be cited as the existing Liminal substrate + Berlin wiring branch:

> `liminal-agents` PR #40: x402 settlement wiring over the real 12-agent substrate

## Rationale

- The hackathons slice already runs as an end-to-end demo and has real LocalNet txids.
- The liminal-agents branch is clean and mergeable, but its real LocalNet/testnet endpoint path still needs final verification.
- This keeps the pitch honest: runnable proof first, product integration second.
- It preserves the Existing Project story by citing `liminal-agents` as the substrate being extended, while preventing judges from cloning a repo and finding the runnable Algorand proof missing.

## Judge-facing wording

Use:

> The submitted demo spine lives in `hackathons/algorand-berlin-2026`; it is the Berlin integration slice that proves x402 settlement, bounded refusal, correction recording, and hash-only Algorand anchoring. The existing Liminal substrate is `liminal-agents`; PR #40 wires the same x402 pattern into its 12-agent API surface.

Avoid:

> `liminal-agents` is the only submission repo.

That overstates the current integration state until PR #40 is merged and real-network verified.

