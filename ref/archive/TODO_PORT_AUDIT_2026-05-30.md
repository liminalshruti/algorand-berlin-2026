---
id: hackathons.algorand-berlin.port-audit.2026-05-30
type: port-audit
status: in-progress · DO NOT MERGE without §8 sign-off
created: 2026-05-30
owner: sean (Claude Code session)
purpose: |
  Port audit for the single algorand-berlin integration branch. Built from
  ops/templates/PORT_AUDIT.md. Reconciles three unmerged hackathons branches +
  a net-new correction/audit lift into one quarantined integration branch,
  routed by four-repo (hackathon-entry) segmentation.
related:
  - founder-brain/ops/templates/PORT_AUDIT.md
  - founder-brain/audits/repo-refactor-inventory-2026-05-28.md
---

# Port Audit — hackathons branches → algorand-berlin-2026 · 2026-05-30

## 1. Provenance — measured, not assumed
- **Target (consolidation sink):** `hackathons/algorand-berlin-2026`
- **Port branch (quarantine, carries this doc):** `port/algorand-berlin-integration-2026-05-30`
- **Base ref:** `origin/main @ 1c75162` · 2026-05-21
- **Reconciliation basis** (`git rev-list --count origin/main..<ref>`, measured — names not trusted):

  | source ref | ahead | top-level dirs touched | subset / disjoint |
  |---|---|---|---|
  | `feat/algorand-berlin-x402-provenance @ b7e0e27` | 1 | algorand-berlin-2026 | **⊂ codex** |
  | `codex/add-algorand-provenance-and-notion-updates @ facf4b6` | 2 | algorand-berlin-2026, **liminal-notion-hack** | — |
  | `feat/erc8004-crosswalk-and-berlin-prep @ 181c6fa` | 3 | algorand-berlin-2026 | **disjoint from codex** |

- **Superseded / dropped (do NOT port):** `feat/algorand-berlin-x402-provenance` — its only commit `b7e0e27` is fully contained in `codex`.
- **Key finding:** no single branch held both the code (`b7e0e27`) and the submission collateral (erc8004 docs). This port is their **union**.

## 2. Four-repo segmentation — routing (entries: algorand-berlin-2026 / evermemos / liminal-natsec / liminal-notion-hack)
- **Lane (this port):** `algorand-berlin-2026`
- **Split-out (routed to another lane, NOT in this port):** `codex @ facf4b6` touches `liminal-notion-hack/**` (DEMO.md, README, SUBMISSION.md, docs/runbooks/deploy-recovery.md, worker pkg) → **liminal-notion-hack lane**. Left on the `codex` branch; not cherry-picked here.
- **Cross-lane leakage check:** [x] confirmed — `git diff --name-only origin/main...HEAD` touches only `algorand-berlin-2026/**` (no `liminal-notion-hack/` files ride along).

## 3. What is being ported
| file / module | from (repo@sha) | role / why valuable | new · additive · REPLACES |
|---|---|---|---|
| `algorand-berlin-2026/provenance/**` (28 files) | hackathons@`b7e0e27` | canonical hash anchoring + x402 settlement slice (28 tests) | new (cherry-pick) |
| `algorand-berlin-2026/ERC8004_LIMINAL_CROSSWALK.md` | hackathons@`2d18a59` | ERC-8004 × Liminal 4-primitive vocab map + Layer 2 framing | new (cherry-pick) |
| `algorand-berlin-2026/INFRASTRUCTURE_TRACK_ONE_PAGER.md` | hackathons@`90126be` | judge-facing pitch + 4-layer stack | new (cherry-pick) |
| `algorand-berlin-2026/TODO_PRE_BERLIN.md` | hackathons@`181c6fa` | day-by-day pre-Berlin checklist (Shruti/Sean lanes) | new (cherry-pick) |
| `provenance/src/vault.ts` | this session · adapted from `liminal-notion-hack/src/vault.ts` | append-only event log added to packet vault | **additive** |
| `provenance/src/projection.ts` | `liminal-notion-hack/src/notion-tools/event-schemas.ts` (gate only) | emergence-stays-local projection gate | new |
| `provenance/src/correction.ts` | `liminal-notion-hack/src/runtime/correction.ts` | correction stream (PPA #5) — reuses `CorrectionKind` from packet.ts | new |
| `provenance/src/index.ts` | this session | export new event + correction symbols | **additive** |
| `provenance/tests/{vault-events,correction}.test.ts` | this session | event-log + correction-stream tests | new |
| `provenance/src/{audit,decision-tags}.ts` + gate audit/refusal wiring | this session · `liminal-notion-hack/src/agents/call.ts` | per-call `agent.call` audit + `lane.refusal` events | new / additive |
| `provenance/bin/loop-demo.ts` (+ `demo:loop*` scripts) | this session | drop→read→correct→sign demo on x402+Algorand (exit-coded smoke test) | new |
| `provenance/README.md`, `docs/INTERNAL_CANON_MAP.md` | this session | correction-loop section + canon mapping (PPA #4/#5) | additive |

## 4. Quarantine method — don't overwrite
- **Isolation:** integration branch off `origin/main`; **zero edits to `main`**; lifted code is additive to `provenance/` (existing files extended, none replaced). Per Sean's "one integration branch" choice, algorand and notion lanes are still separated (notion docs excluded), but the algorand sub-streams (code / docs / lift) share one branch rather than three.
- **Explicitly NOT overwritten:** all 28 original provenance files unchanged except additive edits to `vault.ts` + `index.ts`.
- **Reversibility:** `git branch -D port/algorand-berlin-integration-2026-05-30` drops the entire port; source branches (`codex`, `feat/erc8004-*`) are untouched.
- **Not pushed** (May 28 code freeze).

## 5. Provenance / licensing flags
- **PPA-bearing primitives touched:** **PPA #5** (correction stream — lifted here); **PPA #4** (bounded refusal — x402 lane-check + refusal-as-event, now recorded as `lane.refusal` events).
- **License — RESOLVED (Sean, 2026-05-30):** entry licensed **MIT** (`algorand-berlin-2026/LICENSE`; `provenance/package.json` `"license": "MIT"`). Consistent with sibling `liminal-notion-hack` (already public-MIT with the same PPA #4/#5 primitives); MIT grants **no patent license**, preferable to Apache-2.0 for a patent-asserting holder. **Gate remains:** PPA #4/#5 review before the entry is made **public** for submission (a private push triggers no grant).
- **Public-surface check (banned words / verbalization):** [x] swept algorand-berlin-2026 (README, canon map, judge-facing one-pager, demo) — clean.

## 6. Verification
- [x] `typecheck` clean
- [x] tests green (28 baseline → 47: vault-events + correction + audit + refusal-event + founder/operator use cases)
- [x] demos verified on **LocalNet** (Colima): `demo:localnet`, `demo:x402:localnet`, `demo:loop:localnet` all exit 0 with real txids; mock path still green. Re-verified 2026-06-01 with `DOCKER_HOST=unix:///Users/shayaunnejad/.colima/default/docker.sock`.
- [ ] Public **testnet** run PENDING: provenance account `QMN37XAIZPHBO5MB6GRHRMC6QBINJ4WOGQCUBZKPAXB4OSP2NTRGU6LE2U` exists but has 0 microAlgos; fund before `demo:*:testnet`.
- [x] no content/secret leakage (event log is hash-only; emergence never projected — both tested)

## 7. Open decisions / TODO (carry until resolved)
- [x] License **MIT** applied (Sean 2026-05-30). PPA-exposure review still gates making the entry **public**.
- [x] Notion-lane port branch created locally (`port/notion-hack-deploy-notes-2026-05-30`); push pending (freeze).
- [x] Banned-words sweep on the judge-facing one-pager + all entry docs — clean.
- [x] Step 6 docs complete (README correction-loop section + INTERNAL_CANON_MAP); banned-words sweep clean.
- [x] Close/delete the superseded `feat/algorand-berlin-x402-provenance` branch — local-only branch deleted 2026-06-01; no matching remote branch existed.
- [x] LocalNet real-network demos self-pay (agents' `payTo` = the funded account) so x402 settles on LocalNet; verified 2026-06-01 for provenance spine + liminal-agents companion proof.
- [ ] Give agents distinct funded wallets for the public testnet submission.

## 8. Sign-off gate — do NOT merge to main without this
- Reconciled by: Claude Code session · 2026-05-30
- Merge-authorized by: main already contains the port; public release still pending Shruti/counsel/PPA exposure review.
