import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { IdentityRegistryFactory } from '../artifacts/identity_registry/IdentityRegistryClient'

// Deploy the ERC-8004 Identity Registry. Auto-discovered by smart_contracts/index.ts.
export async function deploy() {
  console.log('=== Deploying IdentityRegistry ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(IdentityRegistryFactory, {
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

  console.log(`IdentityRegistry deployed: appId=${appClient.appClient.appId} addr=${appClient.appAddress}`)
}
