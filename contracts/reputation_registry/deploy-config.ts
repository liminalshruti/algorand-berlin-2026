import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { ReputationRegistryFactory } from '../artifacts/reputation_registry/ReputationRegistryClient'

// Deploy the ERC-8004 Reputation Registry. Auto-discovered by contracts/index.ts.
export async function deploy() {
  console.log('=== Deploying ReputationRegistry ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(ReputationRegistryFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })

  // Fund the app account on first creation (box storage MBR).
  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: (1).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
  }

  console.log(`ReputationRegistry deployed: appId=${appClient.appClient.appId} addr=${appClient.appAddress}`)
}
