# Deployed Smart Contracts — Algorand TestNet

Canonical reference for the ERC-8004 registries deployed on-chain. Source of truth
for app ids is also `apps/web/deployed.testnet.json` (machine-readable).

- **Network:** Algorand **TestNet** (`testnet-v1.0`, genesis prefix `SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe`)
- **Deployer / creator:** `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI` (shared throwaway payer — TestNet ALGO only, never reuse on MainNet)
- **Redeploy:** `npm run deploy:testnet` (orchestrator: `scripts/deploy-testnet.ts`; idempotent via indexer)

## Registries

| Registry | App ID | App address | Identity link (`idApp`) |
|---|---|---|---|
| **IdentityRegistry** | `764031067` | `7GQKWP7LUSOUGPGV4GHVVCEYSIVCTW7MEKRTIDJHHEJW73LIM2JXJVB2SE` | — (root) |
| **ReputationRegistry** | `764031363` | `JELJPBIAQT6FT5BGRODOSPUZPJU3GDX4XESASUQZKKVNPV2KNIBF7ZXDPA` | `764031067` |
| **ValidationRegistry** | `764031094` | `M6IAU57YF6WUNSQQH5XCDT2CTQVQSJ236I5XWMTQBL725LPODTY3KMGNX4` | `764031067` |

Reputation + Validation were `initialize(764031067)`'d so their on-chain global `idApp`
points back at the Identity registry — the ERC-8004 cross-registry link (verified on-chain).

## Deployed code hashes

`approval` = SHA-256 of the on-chain approval program; `clear` = SHA-256 of the on-chain
clear-state program. These pin exactly which compiled TEAL is live and are independently
verifiable (`GET /v2/applications/<id>` → `params.approval-program`, base64-decode, sha256).

| Registry | App ID | Approval program SHA-256 | Clear program SHA-256 |
|---|---|---|---|
| IdentityRegistry | `764031067` | `b58746fdcebb902410e006c2a7ce1ecdfdb7204124440c59f9ac0226dc8251b8` | `ed90f0d2da1f1d1abd773c45230651a292a90edbc12a7bf859a493a12a640ce7` |
| ReputationRegistry | `764031363` | `54ee49c551da6189a058c15bc6e84fc87abdc866dc1a5d4461c734e710cb96f4` | `ed90f0d2da1f1d1abd773c45230651a292a90edbc12a7bf859a493a12a640ce7` |
| ValidationRegistry | `764031094` | `7f2a26a0e0147c6d77591cc0e04032fb01787f5a80ac49f2b0afd4c449514b0a` | `ed90f0d2da1f1d1abd773c45230651a292a90edbc12a7bf859a493a12a640ce7` |

## Creation transactions

| Registry | App ID | Creation txid |
|---|---|---|
| IdentityRegistry | `764031067` | `RMZLTAI5VMRJLSZN7J64EVL7RRFNPQNJPFGU6BQ7I7ENOSESEUHQ` |
| ReputationRegistry | `764031363` | `J7WPJRMH3UFHLX4YF5JHO6JORYUMIAPM4WSTVWL4D4MQHUQ6HPFQ` |
| ValidationRegistry | `764031094` | `EP7YMWQJZCLC4YSUDHPRH6KXRTFSA2P7KCKMEMRPIPQJHSP5F6SQ` |

## Explorer

- Identity:   https://lora.algokit.io/testnet/application/764031067
- Reputation: https://lora.algokit.io/testnet/application/764031363
- Validation: https://lora.algokit.io/testnet/application/764031094

## Notes

- **ReputationRegistry `764031363` includes the ERC-8004 §x402 Profile coupling:**
  `giveFeedback(...)` now takes a mandatory `paymentTxid: byte[32]` + `nonce: uint64`,
  rejects an all-zero proof, and binds each settlement txid to a single feedback
  (replay-guarded). It supersedes an earlier deploy at app id `764031075` (no x402
  coupling; left on-chain but no longer referenced).
