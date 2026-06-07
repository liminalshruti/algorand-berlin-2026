# ARC-8004 trust lifecycle — real TestNet audit trail

A real, end-to-end trust-lifecycle audit trail on **Algorand TestNet** against the deployed
ARC-8004 registries. Every transaction below is confirmed on-chain and links to the explorer.

- **Network:** Algorand TestNet
- **Generated:** 2026-06-07T06:44:19.139Z
- **Status:** complete

## Registries (deployed)

| Registry | App ID | Explorer |
|---|---|---|
| Identity | `764031067` | https://lora.algokit.io/testnet/application/764031067 |
| Reputation | `764031363` | https://lora.algokit.io/testnet/application/764031363 |
| Validation | `764031094` | https://lora.algokit.io/testnet/application/764031094 |

## Agent under audit

- **registry_agent_id:** `3`
- **agent_uri:** https://agents.liminal.local/audit/1780814618126
- **agent_wallet:** `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI`

## Participants

- **Owner / operator** (registers + requests validation): `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI`
- **Client / reviewer** (pays + reviews): `5VVDRKGNVIWWVL5DHMQ2JYZ7UAH33EK552X3BRA76EJ42URCSSH3HSHWP4`
- **Validator** (independent verdict): `2NFOYYAZIAGQCUCVYGBCR72Z3MYWMPMOCB5GXTAKVRIK3FP6UXIBXG4M34`

## Transactions (real, confirmed on TestNet)

| # | Step | Contract · Method | Sender | Round | Transaction |
|---|---|---|---|---|---|
| 1 | fund client/reviewer | payment | `24E3VE…V4XI` | 64125475 | [`XKRZQPZFGR…`](https://lora.algokit.io/testnet/transaction/XKRZQPZFGRH4WFJTW2DYS34J43M7D6RQRLC64ENHGKKKTKSDJNUA) |
| 2 | fund validator | payment | `24E3VE…V4XI` | 64125477 | [`DPBKSSKDMH…`](https://lora.algokit.io/testnet/transaction/DPBKSSKDMHAOVUTMDIC3VWKDHT3Q3MFZISKQMURBF6PA5CA5PXYQ) |
| 3 | register agent | IdentityRegistry.register | `24E3VE…V4XI` | 64125480 | [`FHSMTIAB5R…`](https://lora.algokit.io/testnet/transaction/FHSMTIAB5RJBED3U3VURTJRH5SSWJM4PTR3XCLRKPXONY4MQY2LA) |
| 4 | set agent wallet | IdentityRegistry.setAgentWallet | `24E3VE…V4XI` | 64125482 | [`6BZZCXLV5W…`](https://lora.algokit.io/testnet/transaction/6BZZCXLV5WXHR7HIKF2WV3OLQATHMFJNJDUQ7LZE7BKWFBHSTEPA) |
| 5 | x402 settlement (client → agent) | payment | `5VVDRK…HWP4` | 64125484 | [`BGAG5GF3JC…`](https://lora.algokit.io/testnet/transaction/BGAG5GF3JCK2NOSXYWMV3ILJHX4GSAUT6QVMLGTDWHL7C3CAIYJA) |
| 6 | give feedback (payment-backed review) | ReputationRegistry.giveFeedback | `5VVDRK…HWP4` | 64125487 | [`JOZADVH27C…`](https://lora.algokit.io/testnet/transaction/JOZADVH27C33D4QDP3HA34E4APOIKAUIW7RZ5PG2NY567N5DBIAA) |
| 7 | validation request (owner → validator) | ValidationRegistry.validationRequest | `24E3VE…V4XI` | 64125490 | [`PR4L2I2JR3…`](https://lora.algokit.io/testnet/transaction/PR4L2I2JR35U6GQGMWK5UWP6KDXWVGXFJKTJK55DG34662T3ERSQ) |
| 8 | validation response (validator verdict) | ValidationRegistry.validationResponse | `2NFOYY…4M34` | 64125492 | [`MK7VNPNSSJ…`](https://lora.algokit.io/testnet/transaction/MK7VNPNSSJYZOK3K3BTOXMW2PIB57X2WAVAMVPIEYCH6MBERZTZQ) |

> The review (`giveFeedback`) is bound to the real x402 settlement txid (the payment above) —
> reputation is earned per unique payment, not self-reported. The validation verdict is
> recorded by an independent validator account, not the owner.
