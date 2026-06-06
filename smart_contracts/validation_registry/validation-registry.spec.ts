import { arc4, Bytes, Uint64 } from '@algorandfoundation/algorand-typescript'
import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ValidationRegistry } from './contract.algo'

/**
 * Extensive unit tests for the ERC-8004 Validation Registry port.
 * Runs in-process via the algorand-typescript testing transformer — no Docker, no network.
 */
describe('ValidationRegistry', () => {
  const ctx = new TestExecutionContext()
  let c: ValidationRegistry

  beforeEach(() => {
    c = ctx.contract.create(ValidationRegistry)
  })
  afterEach(() => ctx.reset())

  // --- helpers ---

  const asSender = <T>(sender: ReturnType<typeof ctx.any.account>, fn: () => T): T =>
    ctx.txn.createScope([ctx.any.txn.applicationCall({ appId: c, sender })]).execute(fn)

  const u8 = (n: number) => new arc4.Uint8(n)
  const str = (s: string) => new arc4.Str(s)
  const h32 = (hexByte: string) => new arc4.StaticBytes<32>(Bytes.fromHex(hexByte.repeat(32)))
  const ZERO32 = h32('00')
  const addr = (a: ReturnType<typeof ctx.any.account>) => new arc4.Address(a)
  const vlist = (...a: ReturnType<typeof ctx.any.account>[]) =>
    new arc4.DynamicArray<arc4.Address>(...a.map((x) => new arc4.Address(x)))
  const noValidators = () => new arc4.DynamicArray<arc4.Address>()

  const request = (
    caller: ReturnType<typeof ctx.any.account>,
    validator: ReturnType<typeof ctx.any.account>,
    agentId: number,
    hash: arc4.StaticBytes<32>,
  ) => asSender(caller, () => c.validationRequest(addr(validator), Uint64(agentId), str('ipfs://req'), hash))

  const respond = (
    validator: ReturnType<typeof ctx.any.account>,
    hash: arc4.StaticBytes<32>,
    response: number,
    tag = '',
  ) => asSender(validator, () => c.validationResponse(hash, u8(response), str('ipfs://resp'), ZERO32, str(tag)))

  // --- validationRequest ---

  it('records a request: validator/agentId stored, response defaults to 0', () => {
    const owner = ctx.any.account()
    const validator = ctx.any.account()
    request(owner, validator, 1, h32('aa'))
    const rec = c.getValidationStatus(h32('aa'))
    expect(Number(rec.agentId.asUint64())).toBe(1)
    expect(Number(rec.response.asUint64())).toBe(0)
  })

  it('indexes the request under the agent and the validator', () => {
    const owner = ctx.any.account()
    const validator = ctx.any.account()
    request(owner, validator, 1, h32('aa'))
    expect(Number(c.getAgentValidations(Uint64(1)).length)).toBe(1)
    expect(Number(c.getValidatorRequests(addr(validator)).length)).toBe(1)
  })

  it('rejects a duplicate requestHash', () => {
    const owner = ctx.any.account()
    const validator = ctx.any.account()
    request(owner, validator, 1, h32('aa'))
    expect(() => request(owner, validator, 1, h32('aa'))).toThrow()
  })

  it('getValidationStatus on an unknown request throws', () => {
    expect(() => c.getValidationStatus(h32('ee'))).toThrow()
  })

  // --- owner/operator guard (deferred identity seam) ---

  it('allows a request when owner is unknown (deferred guard inert)', () => {
    const anyone = ctx.any.account()
    const validator = ctx.any.account()
    expect(() => request(anyone, validator, 9, h32('aa'))).not.toThrow()
  })

  it('once the owner is known, only the owner can request validation', () => {
    const owner = ctx.any.account()
    const stranger = ctx.any.account()
    const validator = ctx.any.account()
    c.setAgentOwner(Uint64(1), addr(owner))
    expect(() => request(stranger, validator, 1, h32('aa'))).toThrow()
    expect(() => request(owner, validator, 1, h32('bb'))).not.toThrow()
  })

  // --- validationResponse ---

  it('only the named validator may respond', () => {
    const owner = ctx.any.account()
    const validator = ctx.any.account()
    const impostor = ctx.any.account()
    request(owner, validator, 1, h32('aa'))
    expect(() => respond(impostor, h32('aa'), 100)).toThrow()
    expect(() => respond(validator, h32('aa'), 100)).not.toThrow()
  })

  it('rejects a response > 100', () => {
    const owner = ctx.any.account()
    const validator = ctx.any.account()
    request(owner, validator, 1, h32('aa'))
    expect(() => respond(validator, h32('aa'), 101)).toThrow()
  })

  it('records the response value and tag', () => {
    const owner = ctx.any.account()
    const validator = ctx.any.account()
    request(owner, validator, 1, h32('aa'))
    respond(validator, h32('aa'), 100, 'soft-finality')
    const rec = c.getValidationStatus(h32('aa'))
    expect(Number(rec.response.asUint64())).toBe(100)
    expect(rec.tag.native).toBe('soft-finality')
  })

  it('supports progressive finality — multiple responses overwrite the record', () => {
    const owner = ctx.any.account()
    const validator = ctx.any.account()
    request(owner, validator, 1, h32('aa'))
    respond(validator, h32('aa'), 30, 'soft')
    respond(validator, h32('aa'), 90, 'hard')
    const rec = c.getValidationStatus(h32('aa'))
    expect(Number(rec.response.asUint64())).toBe(90)
    expect(rec.tag.native).toBe('hard')
  })

  // --- getSummary ---

  it('getSummary returns count + average, filtered by validator set and tag', () => {
    const owner = ctx.any.account()
    const v = ctx.any.account()
    const w = ctx.any.account()
    request(owner, v, 1, h32('a1'))
    request(owner, v, 1, h32('a2'))
    request(owner, w, 1, h32('a3'))
    respond(v, h32('a1'), 100, 'final')
    respond(v, h32('a2'), 50, '')
    respond(w, h32('a3'), 0, '')

    const all = c.getSummary(Uint64(1), noValidators(), str(''))
    expect(Number(all.count.asUint64())).toBe(3)
    expect(Number(all.averageResponse.asUint64())).toBe(50) // (100+50+0)/3

    const onlyV = c.getSummary(Uint64(1), vlist(v), str(''))
    expect(Number(onlyV.count.asUint64())).toBe(2)
    expect(Number(onlyV.averageResponse.asUint64())).toBe(75) // (100+50)/2

    const onlyW = c.getSummary(Uint64(1), vlist(w), str(''))
    expect(Number(onlyW.count.asUint64())).toBe(1)
    expect(Number(onlyW.averageResponse.asUint64())).toBe(0)

    const tagged = c.getSummary(Uint64(1), noValidators(), str('final'))
    expect(Number(tagged.count.asUint64())).toBe(1)
    expect(Number(tagged.averageResponse.asUint64())).toBe(100)
  })

  it('getSummary on an agent with no validations is empty', () => {
    const s = c.getSummary(Uint64(42), noValidators(), str(''))
    expect(Number(s.count.asUint64())).toBe(0)
    expect(Number(s.averageResponse.asUint64())).toBe(0)
  })

  // --- identity registry pointer ---

  it('initialize sets the identity app id', () => {
    c.initialize(Uint64(777))
    expect(Number(c.getIdentityRegistry().asUint64())).toBe(777)
  })
})
