/*
 * deploy-testnet.ts · Deploy the three ERC-8004 registries to Algorand TestNet,
 * wired together the way ERC-8004 expects.
 *
 * Standalone integration orchestrator — does NOT modify the per-contract
 * deploy-config.ts files (those deploy each registry in isolation). The point
 * of this script is the ORDER + the LINK:
 *
 *   1. IdentityRegistry            → idAppId
 *   2. ReputationRegistry          → initialize(idAppId)   // points reputation back at Identity
 *   3. ValidationRegistry          → initialize(idAppId)   // points validation back at Identity
 *
 * Deployer = the already-funded shared throwaway TestNet payer (PAYER_MNEMONIC
 * in .env, address 24E3...). TestNet ALGO is valueless; never reuse on MainNet.
 *
 * Resolved app ids are written to public/deployed.testnet.json so the UI can
 * consume the real ids instead of the mock placeholders in arc8004.js.
 *
 *   npx tsx smart_contracts/deploy-testnet.ts      (or: npm run deploy:testnet)
 */
import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { IdentityRegistryFactory } from './artifacts/identity_registry/IdentityRegistryClient'
import { ReputationRegistryFactory } from './artifacts/reputation_registry/ReputationRegistryClient'
import { ValidationRegistryFactory } from './artifacts/validation_registry/ValidationRegistryClient'

// CAIP-2 genesis-hash prefix for TestNet (matches GENESIS.testnet in public/arc8004.js).
const TESTNET_GENESIS_PREFIX = 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe'

async function main() {
  const mnemonic = process.env.PAYER_MNEMONIC
  if (!mnemonic) throw new Error('PAYER_MNEMONIC missing in .env — cannot deploy.')

  const algorand = AlgorandClient.fromConfig({
    algodConfig: {
      server: process.env.ALGOD_URL ?? 'https://testnet-api.algonode.cloud',
      port: Number(process.env.ALGOD_PORT ?? 443),
      token: process.env.ALGOD_TOKEN ?? '',
    },
    // deploy() resolves "already deployed by this creator+name?" via the indexer.
    indexerConfig: {
      server: process.env.INDEXER_URL ?? 'https://testnet-idx.algonode.cloud',
      port: Number(process.env.INDEXER_PORT ?? 443),
      token: process.env.INDEXER_TOKEN ?? '',
    },
  })

  const deployer = algorand.account.fromMnemonic(mnemonic)
  algorand.setDefaultSigner(deployer)

  // Guard: refuse to run against anything that is not TestNet.
  const sp = await algorand.client.algod.getTransactionParams().do()
  if (sp.genesisID && sp.genesisID !== 'testnet-v1.0') {
    throw new Error(`Refusing to deploy: connected node genesis is "${sp.genesisID}", not testnet-v1.0`)
  }
  console.log(`deployer ${deployer.addr.toString()}  network ${sp.genesisID ?? '(unknown)'}`)

  const fundApp = async (address: string, label: string) => {
    await algorand.send.payment({ sender: deployer.addr, receiver: address, amount: (1).algo() })
    console.log(`  funded ${label} app account with 1 ALGO (box-storage MBR)`)
  }

  // 1) Identity ---------------------------------------------------------------
  console.log('\n=== IdentityRegistry ===')
  const idFactory = algorand.client.getTypedAppFactory(IdentityRegistryFactory, { defaultSender: deployer.addr })
  const id = await idFactory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
  if (['create', 'replace'].includes(id.result.operationPerformed)) {
    await fundApp(id.appClient.appAddress.toString(), 'Identity')
  }
  const idAppId = id.appClient.appId
  console.log(`IdentityRegistry   appId=${idAppId}  addr=${id.appClient.appAddress.toString()}`)

  // 2) Reputation → linked to Identity ---------------------------------------
  console.log('\n=== ReputationRegistry ===')
  const repFactory = algorand.client.getTypedAppFactory(ReputationRegistryFactory, { defaultSender: deployer.addr })
  const rep = await repFactory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
  if (['create', 'replace'].includes(rep.result.operationPerformed)) {
    await fundApp(rep.appClient.appAddress.toString(), 'Reputation')
  }
  await rep.appClient.send.initialize({ args: { identityApp: idAppId } })
  console.log(`ReputationRegistry appId=${rep.appClient.appId}  addr=${rep.appClient.appAddress.toString()}  → identityApp=${idAppId}`)

  // 3) Validation → linked to Identity ---------------------------------------
  console.log('\n=== ValidationRegistry ===')
  const valFactory = algorand.client.getTypedAppFactory(ValidationRegistryFactory, { defaultSender: deployer.addr })
  const val = await valFactory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
  if (['create', 'replace'].includes(val.result.operationPerformed)) {
    await fundApp(val.appClient.appAddress.toString(), 'Validation')
  }
  await val.appClient.send.initialize({ args: { identityApp: idAppId } })
  console.log(`ValidationRegistry appId=${val.appClient.appId}  addr=${val.appClient.appAddress.toString()}  → identityApp=${idAppId}`)

  // Record --------------------------------------------------------------------
  const out = {
    network: 'testnet',
    genesisId: sp.genesisID ?? 'testnet-v1.0',
    genesisHashPrefix: TESTNET_GENESIS_PREFIX,
    deployer: deployer.addr.toString(),
    deployedAt: new Date().toISOString(),
    apps: {
      identity: { appId: Number(idAppId), address: id.appClient.appAddress.toString() },
      reputation: { appId: Number(rep.appClient.appId), address: rep.appClient.appAddress.toString(), identityApp: Number(idAppId) },
      validation: { appId: Number(val.appClient.appId), address: val.appClient.appAddress.toString(), identityApp: Number(idAppId) },
    },
  }
  writeFileSync(new URL('../public/deployed.testnet.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
  console.log('\n✓ wrote public/deployed.testnet.json')
  console.log(JSON.stringify(out.apps, null, 2))
}

main().catch((e) => {
  console.error('\nDEPLOY FAILED:', e?.message ?? e)
  process.exit(1)
})
