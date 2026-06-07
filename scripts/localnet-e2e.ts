/**
 * End-to-end test of the ERC-8004 Reputation + Validation registries against AlgoKit LocalNet.
 * Self-deploys both apps, funds them for box MBR, then exercises EVERY ABI method via the
 * generated typed clients on a real algod node. Run: `tsx scripts/localnet-e2e.ts` (LocalNet must be up).
 */
import { AlgorandClient, Config } from '@algorandfoundation/algokit-utils'
import { ReputationRegistryFactory } from '../contracts/artifacts/reputation_registry/ReputationRegistryClient'
import { ValidationRegistryFactory } from '../contracts/artifacts/validation_registry/ValidationRegistryClient'

Config.configure({ populateAppCallResources: true })

// --- int128 <-> bytes helpers ---
const i128 = (n: bigint): Uint8Array => {
  const u = n < 0n ? (1n << 128n) + n : n
  return Uint8Array.from(Buffer.from(u.toString(16).padStart(32, '0'), 'hex'))
}
const fromI128 = (b: Uint8Array): bigint => {
  let u = 0n
  for (const x of b) u = (u << 8n) | BigInt(x)
  return u >= 1n << 127n ? u - (1n << 128n) : u
}
const h32 = (seed: number): Uint8Array => new Uint8Array(32).fill(seed)
const ZERO32 = new Uint8Array(32)
let paymentProofSeq = 0
const feedbackProof = () => {
  paymentProofSeq += 1
  return { paymentTxid: h32(paymentProofSeq), nonce: BigInt(paymentProofSeq) }
}

// --- tiny assertion harness ---
let pass = 0
let fail = 0
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.error('  ✗', name) }
}
const expectThrow = async (name: string, fn: () => Promise<unknown>) => {
  try { await fn(); fail++; console.error('  ✗', name, '(expected a revert)') }
  catch { pass++; console.log('  ✓', name, '(reverted as expected)') }
}

async function main() {
  const algorand = AlgorandClient.defaultLocalNet()
  const dispenser = await algorand.account.localNetDispenser()

  const fundedAccount = async (algos = 10) => {
    const acct = algorand.account.random()
    await algorand.send.payment({ sender: dispenser, receiver: acct, amount: (algos).algo() })
    return acct
  }

  // ============================ REPUTATION ============================
  console.log('\nReputationRegistry @ LocalNet')
  const repFactory = algorand.client.getTypedAppFactory(ReputationRegistryFactory, { defaultSender: dispenser })
  const { appClient: rep } = await repFactory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
  await algorand.send.payment({ sender: dispenser, receiver: rep.appAddress, amount: (10).algo() })

  const alice = await fundedAccount()
  const bob = await fundedAccount()

  // giveFeedback + getLastIndex
  await rep.send.giveFeedback({ sender: alice, args: { agentId: 1n, value: i128(5n), dec: 0, tag1: '', tag2: '', endpoint: '', feedbackUri: '', feedbackHash: ZERO32, ...feedbackProof() } })
  check('giveFeedback -> lastIndex == 1', (await rep.send.getLastIndex({ args: { agentId: 1n, client: alice.addr.toString() } })).return === 1n)
  await rep.send.giveFeedback({ sender: alice, args: { agentId: 1n, value: i128(7n), dec: 0, tag1: '', tag2: '', endpoint: '', feedbackUri: '', feedbackHash: ZERO32, ...feedbackProof() } })
  check('second feedback -> lastIndex == 2', (await rep.send.getLastIndex({ args: { agentId: 1n, client: alice.addr.toString() } })).return === 2n)

  // readFeedback round-trip
  const row = (await rep.send.readFeedback({ args: { agentId: 1n, client: alice.addr.toString(), feedbackIndex: 1n } })).return!
  check('readFeedback value == 5', fromI128(row.value as Uint8Array) === 5n)
  check('readFeedback isRevoked == false', row.isRevoked === false)

  // distinct clients
  await rep.send.giveFeedback({ sender: bob, args: { agentId: 1n, value: i128(3n), dec: 0, tag1: '', tag2: '', endpoint: '', feedbackUri: '', feedbackHash: ZERO32, ...feedbackProof() } })
  check('getClients distinct == 2', (await rep.send.getClients({ args: { agentId: 1n } })).return!.length === 2)

  // getSummary same-sign
  const sum1 = (await rep.send.getSummary({ args: { agentId: 1n, clientAddresses: [alice.addr.toString(), bob.addr.toString()], tag1: '', tag2: '' } })).return!
  check('getSummary count == 3', sum1.count === 3n)
  check('getSummary value == 15', fromI128(sum1.value as Uint8Array) === 15n)

  // dec > 18 reverts
  await expectThrow('giveFeedback dec>18', () => rep.send.giveFeedback({ sender: alice, args: { agentId: 1n, value: i128(1n), dec: 19, tag1: '', tag2: '', endpoint: '', feedbackUri: '', feedbackHash: ZERO32, ...feedbackProof() } }))

  // self-feedback prohibition once owner known
  const owner = await fundedAccount()
  await rep.send.setAgentOwner({ args: { agentId: 2n, owner: owner.addr.toString() } })
  await expectThrow('self-feedback by owner', () => rep.send.giveFeedback({ sender: owner, args: { agentId: 2n, value: i128(1n), dec: 0, tag1: '', tag2: '', endpoint: '', feedbackUri: '', feedbackHash: ZERO32, ...feedbackProof() } }))
  await rep.send.giveFeedback({ sender: alice, args: { agentId: 2n, value: i128(4n), dec: 0, tag1: '', tag2: '', endpoint: '', feedbackUri: '', feedbackHash: ZERO32, ...feedbackProof() } })
  check('non-owner feedback on agent 2 allowed', (await rep.send.getLastIndex({ args: { agentId: 2n, client: alice.addr.toString() } })).return === 1n)

  // revoke
  await rep.send.revokeFeedback({ sender: alice, args: { agentId: 1n, feedbackIndex: 1n } })
  check('revoke flips isRevoked', (await rep.send.readFeedback({ args: { agentId: 1n, client: alice.addr.toString(), feedbackIndex: 1n } })).return!.isRevoked === true)
  await expectThrow('revoke by non-client', () => rep.send.revokeFeedback({ sender: bob, args: { agentId: 1n, feedbackIndex: 2n } }))

  // getSummary excludes revoked (alice idx1=5 revoked, idx2=7 active, bob=3) -> count 2, value 10
  const sum2 = (await rep.send.getSummary({ args: { agentId: 1n, clientAddresses: [alice.addr.toString(), bob.addr.toString()], tag1: '', tag2: '' } })).return!
  check('getSummary excludes revoked: count == 2', sum2.count === 2n)
  check('getSummary excludes revoked: value == 10', fromI128(sum2.value as Uint8Array) === 10n)

  // empty clients reverts
  await expectThrow('getSummary empty clients', () => rep.send.getSummary({ args: { agentId: 1n, clientAddresses: [], tag1: '', tag2: '' } }))

  // mixed-sign on a fresh agent: alice +10, bob -32 -> net -22
  await rep.send.giveFeedback({ sender: alice, args: { agentId: 3n, value: i128(10n), dec: 0, tag1: '', tag2: '', endpoint: '', feedbackUri: '', feedbackHash: ZERO32, ...feedbackProof() } })
  await rep.send.giveFeedback({ sender: bob, args: { agentId: 3n, value: i128(-32n), dec: 0, tag1: '', tag2: '', endpoint: '', feedbackUri: '', feedbackHash: ZERO32, ...feedbackProof() } })
  const sum3 = (await rep.send.getSummary({ args: { agentId: 3n, clientAddresses: [alice.addr.toString(), bob.addr.toString()], tag1: '', tag2: '' } })).return!
  check('getSummary mixed-sign net == -22', fromI128(sum3.value as Uint8Array) === -22n)

  // appendResponse + getResponseCount
  const r1 = await fundedAccount()
  const r2 = await fundedAccount()
  await rep.send.appendResponse({ sender: r1, args: { agentId: 1n, client: alice.addr.toString(), feedbackIndex: 2n, responseUri: 'ipfs://a', responseHash: ZERO32 } })
  await rep.send.appendResponse({ sender: r1, args: { agentId: 1n, client: alice.addr.toString(), feedbackIndex: 2n, responseUri: 'ipfs://b', responseHash: ZERO32 } })
  await rep.send.appendResponse({ sender: r2, args: { agentId: 1n, client: alice.addr.toString(), feedbackIndex: 2n, responseUri: 'ipfs://c', responseHash: ZERO32 } })
  check('getResponseCount sums responders == 3', (await rep.send.getResponseCount({ args: { agentId: 1n, client: alice.addr.toString(), feedbackIndex: 2n, responders: [r1.addr.toString(), r2.addr.toString()] } })).return === 3n)

  // readAllFeedback (agent 1: idx1 revoked, idx2 active) -> 1 active, 2 with revoked
  check('readAllFeedback active only == 1', (await rep.send.readAllFeedback({ args: { agentId: 1n, clientAddresses: [alice.addr.toString()], tag1: '', tag2: '', includeRevoked: false } })).return!.length === 1)
  check('readAllFeedback includeRevoked == 2', (await rep.send.readAllFeedback({ args: { agentId: 1n, clientAddresses: [alice.addr.toString()], tag1: '', tag2: '', includeRevoked: true } })).return!.length === 2)

  // identity registry pointer
  await rep.send.initialize({ args: { identityApp: 123n } })
  check('getIdentityRegistry == 123', (await rep.send.getIdentityRegistry({ args: {} })).return === 123n)

  // ============================ VALIDATION ============================
  console.log('\nValidationRegistry @ LocalNet')
  const valFactory = algorand.client.getTypedAppFactory(ValidationRegistryFactory, { defaultSender: dispenser })
  const { appClient: val } = await valFactory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
  await algorand.send.payment({ sender: dispenser, receiver: val.appAddress, amount: (10).algo() })

  const vOwner = await fundedAccount()
  const validator = await fundedAccount()
  const validator2 = await fundedAccount()

  // validationRequest + status + indexes
  await val.send.validationRequest({ sender: vOwner, args: { validator: validator.addr.toString(), agentId: 1n, requestUri: 'ipfs://req', requestHash: h32(0xa1) } })
  const st = (await val.send.getValidationStatus({ args: { requestHash: h32(0xa1) } })).return!
  check('validationRequest agentId == 1', st.agentId === 1n)
  check('validationRequest default response == 0', Number(st.response) === 0)
  check('getAgentValidations == 1', (await val.send.getAgentValidations({ args: { agentId: 1n } })).return!.length === 1)
  check('getValidatorRequests == 1', (await val.send.getValidatorRequests({ args: { validator: validator.addr.toString() } })).return!.length === 1)

  // duplicate request reverts
  await expectThrow('duplicate requestHash', () => val.send.validationRequest({ sender: vOwner, args: { validator: validator.addr.toString(), agentId: 1n, requestUri: 'x', requestHash: h32(0xa1) } }))
  // unknown status reverts
  await expectThrow('getValidationStatus unknown', () => val.send.getValidationStatus({ args: { requestHash: h32(0xee) } }))

  // owner guard
  await val.send.setAgentOwner({ args: { agentId: 5n, owner: vOwner.addr.toString() } })
  await expectThrow('validationRequest by non-owner', () => val.send.validationRequest({ sender: validator, args: { validator: validator.addr.toString(), agentId: 5n, requestUri: 'x', requestHash: h32(0xb1) } }))
  await val.send.validationRequest({ sender: vOwner, args: { validator: validator.addr.toString(), agentId: 5n, requestUri: 'x', requestHash: h32(0xb2) } })
  check('owner may request', (await val.send.getAgentValidations({ args: { agentId: 5n } })).return!.length === 1)

  // response: only validator, range, value
  await expectThrow('response by non-validator', () => val.send.validationResponse({ sender: validator2, args: { requestHash: h32(0xa1), response: 100, responseUri: '', responseHash: ZERO32, tag: '' } }))
  await expectThrow('response > 100', () => val.send.validationResponse({ sender: validator, args: { requestHash: h32(0xa1), response: 101, responseUri: '', responseHash: ZERO32, tag: '' } }))
  await val.send.validationResponse({ sender: validator, args: { requestHash: h32(0xa1), response: 100, responseUri: 'ipfs://r', responseHash: ZERO32, tag: 'soft' } })
  const st2 = (await val.send.getValidationStatus({ args: { requestHash: h32(0xa1) } })).return!
  check('response recorded == 100', Number(st2.response) === 100)
  check('tag recorded == soft', st2.tag === 'soft')

  // progressive finality: overwrite
  await val.send.validationResponse({ sender: validator, args: { requestHash: h32(0xa1), response: 90, responseUri: '', responseHash: ZERO32, tag: 'hard' } })
  const st3 = (await val.send.getValidationStatus({ args: { requestHash: h32(0xa1) } })).return!
  check('progressive overwrite response == 90', Number(st3.response) === 90)
  check('progressive overwrite tag == hard', st3.tag === 'hard')

  // getSummary on agent 1: respond a1=90 (already), add a2 by validator2=50
  await val.send.validationRequest({ sender: vOwner, args: { validator: validator2.addr.toString(), agentId: 1n, requestUri: 'x', requestHash: h32(0xa2) } })
  await val.send.validationResponse({ sender: validator2, args: { requestHash: h32(0xa2), response: 50, responseUri: '', responseHash: ZERO32, tag: '' } })
  const vAll = (await val.send.getSummary({ args: { agentId: 1n, validators: [], tag: '' } })).return!
  check('validation getSummary count == 2', vAll.count === 2n)
  check('validation getSummary avg == 70', Number(vAll.averageResponse) === 70) // (90+50)/2
  const vOnly = (await val.send.getSummary({ args: { agentId: 1n, validators: [validator.addr.toString()], tag: '' } })).return!
  check('validation getSummary filtered count == 1', vOnly.count === 1n)
  check('validation getSummary filtered avg == 90', Number(vOnly.averageResponse) === 90)

  // identity pointer
  await val.send.initialize({ args: { identityApp: 777n } })
  check('validation getIdentityRegistry == 777', (await val.send.getIdentityRegistry({ args: {} })).return === 777n)

  // ============================ SUMMARY ============================
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
