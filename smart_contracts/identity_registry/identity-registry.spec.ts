import { arc4, Global } from '@algorandfoundation/algorand-typescript'
import { TestExecutionContext, toExternalValue } from '@algorandfoundation/algorand-typescript-testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extToHex, hexToBytes } from '../../vitest.helpers'
import { IdentityRegistry } from './contract.algo'
import type { MetadataEntry } from './contract.algo'

/**
 * In-process tests for the ERC-8004 Identity Registry / ARC-72 port.
 * Runs with no Docker and no network.
 */
describe('IdentityRegistry', () => {
  const ctx = new TestExecutionContext()
  let c: IdentityRegistry

  beforeEach(() => {
    c = ctx.contract.create(IdentityRegistry)
  })
  afterEach(() => ctx.reset())

  // --- helpers ---

  const asSender = <T>(sender: ReturnType<typeof ctx.any.account>, fn: () => T): T =>
    ctx.txn.createScope([ctx.any.txn.applicationCall({ appId: c, sender })]).execute(fn)

  const addr = (a: ReturnType<typeof ctx.any.account>) => new arc4.Address(a)
  const token = (id: number) => new arc4.Uint256(id)
  const str = (s: string) => new arc4.Str(s)
  const dyn = (s: string) => new arc4.DynamicBytes(s)
  const sel = (hex: string) => new arc4.StaticBytes<4>(hexToBytes(hex) as never)
  const emptyMetadata = () => new arc4.DynamicArray<MetadataEntry>()

  const register = (owner: ReturnType<typeof ctx.any.account>, uri = 'ipfs://agent') =>
    asSender(owner, () => Number(c.register(str(uri), emptyMetadata()).asUint64()))

  // --- register + identity reads ---

  it('register mints a uint64 agent id, stores owner, URI, wallet, balance, and supply', () => {
    const owner = ctx.any.account()
    const id = register(owner)

    expect(id).toBe(1)
    expect(c.arc72_ownerOf(token(1)).native).toStrictEqual(owner)
    expect(c.getAgentURI(token(1)).native).toBe('ipfs://agent')
    expect(c.getAgentWallet(token(1)).native).toStrictEqual(owner)
    expect(Number(c.arc72_balanceOf(addr(owner)).asUint64())).toBe(1)
    expect(Number(c.arc72_totalSupply().asUint64())).toBe(1)
    expect(Number(c.arc72_tokenByIndex(token(0)).asUint64())).toBe(1)
  })

  it('arc72_ownerOf returns zero address for an invalid token id', () => {
    expect(c.arc72_ownerOf(token(999)).native).toStrictEqual(Global.zeroAddress)
  })

  it('arc72_tokenURI returns the ARC-72 fixed byte[256] URI view', () => {
    const owner = ctx.any.account()
    register(owner, 'ipfs://agent')

    const raw = extToHex(toExternalValue(c.arc72_tokenURI(token(1)).native))
    expect(raw.length).toBe(512)
    expect(c.getAgentURI(token(1)).native).toBe('ipfs://agent')
  })

  // --- URI + metadata ---

  it('setAgentURI is owner/operator gated and updates the ERC-8004 agent URI', () => {
    const owner = ctx.any.account()
    const stranger = ctx.any.account()
    register(owner)

    expect(() => asSender(stranger, () => c.setAgentURI(token(1), str('ipfs://bad')))).toThrow()
    asSender(owner, () => c.setAgentURI(token(1), str('ipfs://updated')))
    expect(c.getAgentURI(token(1)).native).toBe('ipfs://updated')
  })

  it('metadata round-trips and reserves agentWallet for dedicated wallet methods', () => {
    const owner = ctx.any.account()
    const id = register(owner)

    expect(id).toBe(1)
    asSender(owner, () => c.setMetadata(token(1), str('role'), dyn('router')))
    expect(extToHex(toExternalValue(c.getMetadata(token(1), str('role')).native))).toBe('726f75746572')
    expect(() => asSender(owner, () => c.setMetadata(token(1), str('agentWallet'), dyn('reserved')))).toThrow()
  })

  it('setAgentWallet updates and unsetAgentWallet clears the reserved wallet pointer', () => {
    const owner = ctx.any.account()
    const wallet = ctx.any.account()
    register(owner)

    asSender(owner, () => c.setAgentWallet(token(1), addr(wallet)))
    expect(c.getAgentWallet(token(1)).native).toStrictEqual(wallet)
    asSender(owner, () => c.unsetAgentWallet(token(1)))
    expect(c.getAgentWallet(token(1)).native).toStrictEqual(Global.zeroAddress)
  })

  // --- approvals + transfers ---

  it('single-token approval can transfer, then transfer clears approval and agentWallet', () => {
    const owner = ctx.any.account()
    const approved = ctx.any.account()
    const nextOwner = ctx.any.account()
    register(owner)

    asSender(owner, () => c.arc72_approve(addr(approved), token(1)))
    expect(c.arc72_getApproved(token(1)).native).toStrictEqual(approved)

    asSender(approved, () => c.arc72_transferFrom(addr(owner), addr(nextOwner), token(1)))
    expect(c.arc72_ownerOf(token(1)).native).toStrictEqual(nextOwner)
    expect(c.arc72_getApproved(token(1)).native).toStrictEqual(Global.zeroAddress)
    expect(c.getAgentWallet(token(1)).native).toStrictEqual(Global.zeroAddress)
    expect(Number(c.arc72_balanceOf(addr(owner)).asUint64())).toBe(0)
    expect(Number(c.arc72_balanceOf(addr(nextOwner)).asUint64())).toBe(1)
  })

  it('operator approval authorizes transfers and can be revoked', () => {
    const owner = ctx.any.account()
    const operator = ctx.any.account()
    const nextOwner = ctx.any.account()
    register(owner)

    asSender(owner, () => c.arc72_setApprovalForAll(addr(operator), new arc4.Bool(true)))
    expect(c.arc72_isApprovedForAll(addr(owner), addr(operator)).native).toBe(true)
    asSender(operator, () => c.arc72_transferFrom(addr(owner), addr(nextOwner), token(1)))

    asSender(nextOwner, () => c.arc72_setApprovalForAll(addr(operator), new arc4.Bool(false)))
    expect(c.arc72_isApprovedForAll(addr(nextOwner), addr(operator)).native).toBe(false)
  })

  it('transfer rejects wrong from owner and unauthorized sender', () => {
    const owner = ctx.any.account()
    const stranger = ctx.any.account()
    const nextOwner = ctx.any.account()
    register(owner)

    expect(() => asSender(owner, () => c.arc72_transferFrom(addr(stranger), addr(nextOwner), token(1)))).toThrow()
    expect(() => asSender(stranger, () => c.arc72_transferFrom(addr(owner), addr(nextOwner), token(1)))).toThrow()
  })

  // --- interface detection + enumeration ---

  it('supports ARC-73, ARC-72 core, metadata, transfer-management, and enumeration interface ids', () => {
    expect(c.supportsInterface(sel('4e22a3ba')).native).toBe(true)
    expect(c.supportsInterface(sel('53f02a40')).native).toBe(true)
    expect(c.supportsInterface(sel('c3c1fc00')).native).toBe(true)
    expect(c.supportsInterface(sel('b9c6f696')).native).toBe(true)
    expect(c.supportsInterface(sel('a57d4679')).native).toBe(true)
    expect(c.supportsInterface(sel('ffffffff')).native).toBe(false)
    expect(c.supportsInterface(sel('00000000')).native).toBe(false)
  })

  it('enumerates minted tokens by zero-based index', () => {
    const alice = ctx.any.account()
    const bob = ctx.any.account()
    register(alice, 'ipfs://one')
    register(bob, 'ipfs://two')

    expect(Number(c.arc72_totalSupply().asUint64())).toBe(2)
    expect(Number(c.arc72_tokenByIndex(token(0)).asUint64())).toBe(1)
    expect(Number(c.arc72_tokenByIndex(token(1)).asUint64())).toBe(2)
    expect(() => c.arc72_tokenByIndex(token(2))).toThrow()
  })
})
