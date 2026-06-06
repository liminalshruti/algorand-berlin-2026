# Liminal × Algorand — Berlin Builders Hack (Agentic Commerce × x402)

Liminal's entry for **Algorand Builders Berlin: Agentic Commerce x402**. Two layers on one
Algorand substrate, plus a correction loop on top:

1. **Provenance** — sign a local packet → canonical hash → anchor the hash on Algorand → store
   the receipt in the vault → anyone can verify the packet existed, unaltered, **without seeing
   its content**. Hash-only on chain.
2. **x402 agent commerce** — bounded agents transact over the x402 payment protocol with a
   structural guard: an agent serves and charges only for in-lane work; out-of-lane work is
   refused for free. A paid delivery is then provenance-anchored — paid here, proven here.
3. **Correction loop** — corrections are first-class, typed data; a corrected re-read is
   re-anchored with a different hash. Every settle / serve / anchor / refusal is recorded in an
   append-only vault event log.

Runs with **zero external services by default** (in-memory mock chain). Switch to AlgoKit
LocalNet or public testnet with one env var.

## Layout

- [`provenance/`](provenance/) — the code package. See [`provenance/README.md`](provenance/README.md) to run it.
- [`ERC8004_AVM_MAPPING.md`](ERC8004_AVM_MAPPING.md) — construct-by-construct port of ERC-8004 (Trustless Agents) to the AVM. Build against this.
- [`provenance/docs/X402_OFFICIAL_COMPARISON.md`](provenance/docs/X402_OFFICIAL_COMPARISON.md) — protocol-level comparison vs. the Algorand Foundation's official x402 demo.
- [`DEMO_SCENARIO.md`](DEMO_SCENARIO.md) — the demo walkthrough.
- [`HACKDAY_RUNBOOK.md`](HACKDAY_RUNBOOK.md) — setup and run checklist.

## Quick start

```bash
cd provenance
npm install
npm test          # full suite on the mock chain — no Docker, no network, no secrets
node bin/demo.ts  # provenance walkthrough
```

## License

MIT — see [LICENSE](LICENSE).
