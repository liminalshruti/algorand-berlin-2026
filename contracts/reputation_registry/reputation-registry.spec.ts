import { arc4, Bytes, Uint64 } from '@algorandfoundation/algorand-typescript'
import { TestExecutionContext, toExternalValue } from '@algorandfoundation/algorand-typescript-testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extToHex, i128Hex, twosToBigInt } from '../../vitest.helpers'
import { ReputationRegistry } from './contract.algo'

/**
 * Extensive unit tests for the ERC-8004 Reputation Registry port.
 * Runs in-process via the algorand-typescript testing transformer — no Docker, no network.
 */
describe('ReputationRegistry', () => {
  const ctx = new TestExecutionContext()
  let c: ReputationRegistry

  beforeEach(() => {
    c = ctx.contract.create(ReputationRegistry)
  })
  afterEach(() => ctx.reset())

  // --- helpers ---

  // call a method with a chosen Txn.sender
  const asSender = <T>(sender: ReturnType<typeof ctx.any.account>, fn: () => T): T =>
    ctx.txn.createScope([ctx.any.txn.applicationCall({ appId: c, sender })]).execute(fn)

  // build a signed int128 as a 16-byte two's-complement arc4 value (hex math done in untransformed helper)
  const i128 = (n: bigint): arc4.StaticBytes<16> => new arc4.StaticBytes<16>(Bytes.fromHex(i128Hex(n)))
  // decode a stored/returned int128 back to a signed bigint
  const dec128 = (sb: arc4.StaticBytes<16>): bigint => twosToBigInt(extToHex(toExternalValue(sb.native)))
  const u8 = (n: number) => new arc4.Uint8(n)
  const str = (s: string) => new arc4.Str(s)
  const h32 = (hexByte: string) => new arc4.StaticBytes<32>(Bytes.fromHex(hexByte.repeat(32)))
  const ZERO32 = h32('00')
  const addr = (a: ReturnType<typeof ctx.any.account>) => new arc4.Address(a)
  const list = (...a: ReturnType<typeof ctx.any.account>[]) =>
    new arc4.DynamicArray<arc4.Address>(...a.map((x) => new arc4.Address(x)))

  // unique, non-zero x402 proof-of-payment txid per call (replay guard rejects reuse)
  let paySeq = 0
  const txid = (seq: number) => new arc4.StaticBytes<32>(Bytes.fromHex(seq.toString(16).padStart(64, '0')))

  // give one feedback row as `client` about `agentId`
  const give = (
    client: ReturnType<typeof ctx.any.account>,
    agentId: number,
    value: bigint,
    opts: { dec?: number; tag1?: string; tag2?: string; paymentTxid?: arc4.StaticBytes<32>; nonce?: number } = {},
  ) =>
    asSender(client, () =>
      c.giveFeedback(
        Uint64(agentId),
        i128(value),
        u8(opts.dec ?? 0),
        str(opts.tag1 ?? ''),
        str(opts.tag2 ?? ''),
        str(''),
        str(''),
        ZERO32,
        opts.paymentTxid ?? txid(++paySeq),
        new arc4.Uint64(opts.nonce ?? paySeq),
      ),
    )

  // --- giveFeedback + indexing + storage ---

  it('records feedback and increments per-(agent,client) feedbackIndex', () => {
    const alice = ctx.any.account()
    give(alice, 1, 5n)
    expect(Number(c.getLastIndex(Uint64(1), addr(alice)).asUint64())).toBe(1)
    give(alice, 1, 7n)
    expect(Number(c.getLastIndex(Uint64(1), addr(alice)).asUint64())).toBe(2)
  })

  it('stores value/dec/tags and isRevoked=false; readFeedback round-trips', () => {
    const alice = ctx.any.account()
    give(alice, 1, 42n, { dec: 2, tag1: 'speed', tag2: 'eu' })
    const row = c.readFeedback(Uint64(1), addr(alice), Uint64(1))
    expect(dec128(row.value)).toBe(42n)
    expect(Number(row.dec.asUint64())).toBe(2)
    expect(row.tag1.native).toBe('speed')
    expect(row.tag2.native).toBe('eu')
    expect(row.isRevoked.native).toBe(false)
  })

  it('rejects valueDecimals > 18', () => {
    const alice = ctx.any.account()
    expect(() => give(alice, 1, 1n, { dec: 19 })).toThrow()
  })

  // --- ERC-8004 §x402 Profile: mandatory, single-use proof-of-payment ---

  it('requires an x402 paymentTxid (rejects an all-zero proof)', () => {
    const alice = ctx.any.account()
    expect(() => give(alice, 1, 1n, { paymentTxid: ZERO32 })).toThrow()
  })

  it('binds each settlement to one feedback (rejects a reused proof)', () => {
    const alice = ctx.any.account()
    const proof = txid(0x9999)
    expect(() => give(alice, 1, 1n, { paymentTxid: proof })).not.toThrow()
    expect(() => give(alice, 1, 2n, { paymentTxid: proof })).toThrow()
  })

  it('tracks distinct clients per agent (getClients), once each', () => {
    const alice = ctx.any.account()
    const bob = ctx.any.account()
    give(alice, 1, 1n)
    give(alice, 1, 2n) // second feedback from alice — must not duplicate her in clients
    give(bob, 1, 3n)
    expect(Number(c.getClients(Uint64(1)).length)).toBe(2)
  })

  // --- self-feedback prohibition (deferred identity seam) ---

  it('allows feedback when owner is unknown (deferred guard inert)', () => {
    const anyone = ctx.any.account()
    expect(() => give(anyone, 7, 1n)).not.toThrow()
  })

  it('prohibits self-feedback once the owner is known', () => {
    const owner = ctx.any.account()
    const other = ctx.any.account()
    c.setAgentOwner(Uint64(1), addr(owner))
    expect(() => give(owner, 1, 1n)).toThrow()
    expect(() => give(other, 1, 1n)).not.toThrow()
  })

  // --- revoke ---

  it('revokeFeedback flips isRevoked for the original client', () => {
    const alice = ctx.any.account()
    give(alice, 1, 5n)
    asSender(alice, () => c.revokeFeedback(Uint64(1), Uint64(1)))
    expect(c.readFeedback(Uint64(1), addr(alice), Uint64(1)).isRevoked.native).toBe(true)
  })

  it('revokeFeedback by a non-original client fails (key is sender-scoped)', () => {
    const alice = ctx.any.account()
    const mallory = ctx.any.account()
    give(alice, 1, 5n)
    expect(() => asSender(mallory, () => c.revokeFeedback(Uint64(1), Uint64(1)))).toThrow()
  })

  // --- getSummary ---

  it('getSummary requires a non-empty clientAddresses list (Sybil guard)', () => {
    expect(() => c.getSummary(Uint64(1), new arc4.DynamicArray<arc4.Address>(), str(''), str(''))).toThrow()
  })

  it('getSummary counts non-revoked rows and sums same-sign values', () => {
    const alice = ctx.any.account()
    const bob = ctx.any.account()
    give(alice, 1, 5n)
    give(bob, 1, 3n)
    const s = c.getSummary(Uint64(1), list(alice, bob), str(''), str(''))
    expect(Number(s.count.asUint64())).toBe(2)
    expect(dec128(s.value)).toBe(8n)
  })

  it('getSummary nets mixed-sign values correctly', () => {
    const alice = ctx.any.account()
    const bob = ctx.any.account()
    give(alice, 1, 10n)
    give(bob, 1, -32n)
    const s = c.getSummary(Uint64(1), list(alice, bob), str(''), str(''))
    expect(Number(s.count.asUint64())).toBe(2)
    expect(dec128(s.value)).toBe(-22n)
  })

  it('getSummary excludes revoked rows', () => {
    const alice = ctx.any.account()
    give(alice, 1, 5n)
    give(alice, 1, 100n)
    asSender(alice, () => c.revokeFeedback(Uint64(1), Uint64(2))) // revoke the 100
    const s = c.getSummary(Uint64(1), list(alice), str(''), str(''))
    expect(Number(s.count.asUint64())).toBe(1)
    expect(dec128(s.value)).toBe(5n)
  })

  it('getSummary filters by tag1', () => {
    const alice = ctx.any.account()
    give(alice, 1, 5n, { tag1: 'speed' })
    give(alice, 1, 9n, { tag1: 'price' })
    const s = c.getSummary(Uint64(1), list(alice), str('speed'), str(''))
    expect(Number(s.count.asUint64())).toBe(1)
    expect(dec128(s.value)).toBe(5n)
  })

  // --- readAllFeedback ---

  it('readAllFeedback returns rows and honors includeRevoked', () => {
    const alice = ctx.any.account()
    give(alice, 1, 5n)
    give(alice, 1, 6n)
    asSender(alice, () => c.revokeFeedback(Uint64(1), Uint64(2)))
    expect(Number(c.readAllFeedback(Uint64(1), list(alice), str(''), str(''), false).length)).toBe(1)
    expect(Number(c.readAllFeedback(Uint64(1), list(alice), str(''), str(''), true).length)).toBe(2)
  })

  // --- appendResponse + getResponseCount ---

  it('appendResponse increments per-responder count; getResponseCount sums responders', () => {
    const alice = ctx.any.account()
    const responder1 = ctx.any.account()
    const responder2 = ctx.any.account()
    give(alice, 1, 5n)
    asSender(responder1, () => c.appendResponse(Uint64(1), addr(alice), Uint64(1), str('ipfs://a'), ZERO32))
    asSender(responder1, () => c.appendResponse(Uint64(1), addr(alice), Uint64(1), str('ipfs://b'), ZERO32))
    asSender(responder2, () => c.appendResponse(Uint64(1), addr(alice), Uint64(1), str('ipfs://c'), ZERO32))
    const n = c.getResponseCount(Uint64(1), addr(alice), Uint64(1), list(responder1, responder2))
    expect(Number(n.asUint64())).toBe(3)
  })

  // --- identity registry pointer ---

  it('initialize sets the identity app id', () => {
    c.initialize(Uint64(123))
    expect(Number(c.getIdentityRegistry().asUint64())).toBe(123)
  })
})
