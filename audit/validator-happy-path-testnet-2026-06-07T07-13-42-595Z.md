# Validator happy path — real TestNet audit trail

A real **validator happy path** on **Algorand TestNet** against the deployed ARC-8004 Validation
registry: an agent is independently validated by two validators who attest it **passes**.
Validator #1 demonstrates progressive finality (soft interim → hard final). Every row is a real,
confirmed transaction.

- **Network:** Algorand TestNet
- **Generated:** 2026-06-07T07:13:42.595Z
- **Status:** complete

## Registries (deployed)

| Registry | App ID | Explorer |
|---|---|---|
| Identity | `764031067` | https://lora.algokit.io/testnet/application/764031067 |
| Validation | `764031094` | https://lora.algokit.io/testnet/application/764031094 |

## Agent under validation

- **registry_agent_id:** `4`
- **agent_uri:** https://agents.liminal.local/validator-demo/1780816371431

## Participants

- **Owner / requester:** `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI`
- **Validator #1** (soft → hard): `762MG7ZNCLO7JROLSXPDX2KREVYJTM32PUXVWDUVXPNZKBMFADWFW63XHQ`
- **Validator #2** (hard): `GSQVRSRWOY34G6WXCPDF6CFBKVDXTJYHEZJ23OGVL3JVSHP4EZ2S6FYJ24`

## Transactions (real, confirmed on TestNet)

| # | Step | Contract · Method | Sender | Round | Transaction |
|---|---|---|---|---|---|
| 1 | fund validator #1 | payment | `24E3VE…V4XI` | 64126120 | [`QXWM746QDD…`](https://lora.algokit.io/testnet/transaction/QXWM746QDDA2ULLOMMEF76DDV737Q2BKWGFSSSOTG5LZC3WXM3LQ) |
| 2 | fund validator #2 | payment | `24E3VE…V4XI` | 64126122 | [`EIYPVKXBPG…`](https://lora.algokit.io/testnet/transaction/EIYPVKXBPGFQNZWRUFO3TBGYGX2MH2IVJFVZH3VGWE6NW75A3FYA) |
| 3 | register agent under validation | IdentityRegistry.register | `24E3VE…V4XI` | 64126126 | [`6H2AGUDQSI…`](https://lora.algokit.io/testnet/transaction/6H2AGUDQSI6R4AWEFATDCLM4XAYOLLMSKWZ4DHCZTQSKHWSGP5ZQ) |
| 4 | validation request → validator #1 | ValidationRegistry.validationRequest | `24E3VE…V4XI` | 64126129 | [`FCDAKHNQL2…`](https://lora.algokit.io/testnet/transaction/FCDAKHNQL2QYEWD5UWLB77PJLCHJN5CF7EMAWVZLBS4GRYHHKN5Q) |
| 5 | validator #1 soft interim result (85) | ValidationRegistry.validationResponse | `762MG7…3XHQ` | 64126132 | [`ZRQH4GESML…`](https://lora.algokit.io/testnet/transaction/ZRQH4GESMLL3N7AQTZCCCVLZBP4IMSXOCJDS623XDJTZJ3IOFOHA) |
| 6 | validator #1 hard PASS (100) | ValidationRegistry.validationResponse | `762MG7…3XHQ` | 64126135 | [`UY4VKA3EBI…`](https://lora.algokit.io/testnet/transaction/UY4VKA3EBIDQYNPZ2CFT54PQTI5LBNYFMJACBQJELCD2FSHT662A) |
| 7 | validation request → validator #2 | ValidationRegistry.validationRequest | `24E3VE…V4XI` | 64126138 | [`CFFCKXFJ6M…`](https://lora.algokit.io/testnet/transaction/CFFCKXFJ6MJYCIJRNSMZQLOZLQUARYRO55CWITYT5WFFCUN2PSAQ) |
| 8 | validator #2 hard PASS (100) | ValidationRegistry.validationResponse | `GSQVRS…YJ24` | 64126141 | [`WBG7HRI2DK…`](https://lora.algokit.io/testnet/transaction/WBG7HRI2DKE5VGPD3IIKUNLYHSFOD4376HDHYDLNMV4KX5ORHDKQ) |

## Read-back verification (on-chain state)

- ✅ **validator #1 request finalized:** response=`100`, tag=`hard` (expected 100 / hard)
- ✅ **agent validation summary:** count=`2`, average response=`100` (expected count=2, average=100)

> Both validators are accounts independent of the agent owner; their responses (0–100) are
> attestations recorded on-chain. Validator #1 posts a soft interim result first, then
> overwrites it with a hard-finality pass — the progressive-finality happy path.
