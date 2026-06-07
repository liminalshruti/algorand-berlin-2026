import {
  Account,
  arc4,
  assert,
  BoxMap,
  Bytes,
  bytes,
  clone,
  emit,
  Global,
  GlobalState,
  op,
  Txn,
  uint64,
} from '@algorandfoundation/algorand-typescript'
import {
  MetadataSet,
  Registered,
  URIUpdated,
  arc72_Approval,
  arc72_ApprovalForAll,
  arc72_Transfer,
} from '../lib/events'

/**
 * ERC-8004 Identity Registry, ported to Algorand as an ARC-72-style smart-contract NFT.
 *
 * The canonical protocol identity is `{agentRegistry, agentId}` where `agentRegistry` is the
 * Identity app id on a CAIP-2 Algorand network and `agentId` is a uint64-backed ARC-72 token id.
 * ARC-72 methods expose uint256 token ids for compatibility; internally this app asserts they fit
 * the repo's ERC-8004 mapping choice of uint64 agent ids.
 */

export class MetadataEntry extends arc4.Struct<{
  key: arc4.Str
  value: arc4.DynamicBytes
}> {}

export class IdentityRegistry extends arc4.Contract {
  /** Next agent id to mint. 0 is invalid/zero-address, so minting starts at 1. */
  nextId = GlobalState<uint64>({ key: 'nextId', initialValue: 1 })
  /** Number of live agent NFTs. No burn method exists in this MVP, so this is also minted count. */
  supply = GlobalState<uint64>({ key: 'supply', initialValue: 0 })

  /** owner of agentId. key = agentId */
  owners = BoxMap<uint64, arc4.Address>({ keyPrefix: 'own' })
  /** agentURI / ARC-72 token URI. key = agentId */
  uris = BoxMap<uint64, arc4.Str>({ keyPrefix: 'uri' })
  /** single-token approval. key = agentId */
  approvals = BoxMap<uint64, arc4.Address>({ keyPrefix: 'apr' })
  /** operator approval. key = owner(32) ++ operator(32) */
  operatorApprovals = BoxMap<bytes, arc4.Bool>({ keyPrefix: 'opr' })
  /** owner balance. key = owner address(32) */
  balances = BoxMap<bytes, arc4.Uint64>({ keyPrefix: 'bal' })
  /** metadata kv. key = agentId(8) ++ key */
  metadata = BoxMap<bytes, arc4.DynamicBytes>({ keyPrefix: 'md' })
  /** reserved ERC-8004 agentWallet. key = agentId */
  agentWallets = BoxMap<uint64, arc4.Address>({ keyPrefix: 'wal' })
  /** enumeration index. key = zero-based index -> agentId */
  agentAtIndex = BoxMap<uint64, arc4.Uint64>({ keyPrefix: 'idx' })

  // --- ERC-8004 identity writes ---

  /** register(agentURI, metadata) -> agentId. Mints to Txn.sender and sets agentWallet=Txn.sender. */
  register(agentURI: arc4.Str, metadata: arc4.DynamicArray<MetadataEntry>): arc4.Uint64 {
    const agentId = this.nextId.value
    this.nextId.value = agentId + 1

    const tokenId = this.agentIdToTokenId(agentId)
    const owner = new arc4.Address(Txn.sender)

    this.owners(agentId).value = clone(owner)
    this.uris(agentId).value = clone(agentURI)
    this.agentWallets(agentId).value = clone(owner)

    const index = this.supply.value
    this.agentAtIndex(index).value = new arc4.Uint64(agentId)
    this.supply.value = index + 1
    this.incrementBalance(Txn.sender)

    for (const entry of clone(metadata)) {
      this.setMetadataInternal(agentId, entry.key, entry.value)
    }

    emit(new arc72_Transfer({ from: this.zeroAddress(), to: clone(owner), tokenId }))
    emit(new Registered({ agentId: new arc4.Uint64(agentId), agentURI, owner }))

    return new arc4.Uint64(agentId)
  }

  /** setAgentURI(id, uri). Callable by owner or approved operator. */
  setAgentURI(tokenId: arc4.Uint256, agentURI: arc4.Str): void {
    const agentId = this.existingAgentId(tokenId)
    this.requireOwnerOrOperator(agentId)
    this.uris(agentId).value = clone(agentURI)
    emit(new URIUpdated({ agentId: new arc4.Uint64(agentId), agentURI, owner: this.ownerOfExisting(agentId) }))
  }

  /** setMetadata(id, key, value). Reserved key `agentWallet` is written through setAgentWallet only. */
  setMetadata(tokenId: arc4.Uint256, key: arc4.Str, value: arc4.DynamicBytes): void {
    const agentId = this.existingAgentId(tokenId)
    this.requireOwnerOrOperator(agentId)
    this.setMetadataInternal(agentId, key, value)
  }

  /** setAgentWallet(id, wallet). Owner/operator assertion is the MVP verification seam. */
  setAgentWallet(tokenId: arc4.Uint256, wallet: arc4.Address): void {
    const agentId = this.existingAgentId(tokenId)
    this.requireOwnerOrOperator(agentId)
    assert(wallet.native !== Global.zeroAddress, 'agentWallet cannot be zero')
    this.agentWallets(agentId).value = clone(wallet)
    emit(
      new MetadataSet({
        agentId: new arc4.Uint64(agentId),
        key: new arc4.Str('agentWallet'),
        value: new arc4.DynamicBytes(wallet.bytes),
      }),
    )
  }

  /** unsetAgentWallet(id). Clears the reserved wallet pointer. */
  unsetAgentWallet(tokenId: arc4.Uint256): void {
    const agentId = this.existingAgentId(tokenId)
    this.requireOwnerOrOperator(agentId)
    this.agentWallets(agentId).delete()
  }

  // --- ARC-72 core + transfer management ---

  /** arc72_ownerOf(uint256) -> address. Invalid token ids return zero address per ARC-72. */
  @arc4.abimethod({ readonly: true })
  arc72_ownerOf(tokenId: arc4.Uint256): arc4.Address {
    if (!this.fitsUint64(tokenId)) return this.zeroAddress()
    return this.owners(tokenId.asUint64()).get({ default: this.zeroAddress() })
  }

  /** arc72_transferFrom(from, to, tokenId). Clears single approval + agentWallet on transfer. */
  arc72_transferFrom(from: arc4.Address, to: arc4.Address, tokenId: arc4.Uint256): void {
    const agentId = this.existingAgentId(tokenId)
    const owner = this.ownerOfExisting(agentId)
    assert(from.native === owner.native, 'from is not owner')
    assert(to.native !== Global.zeroAddress, 'to cannot be zero')
    assert(this.isApprovedOrOwner(Txn.sender, agentId), 'not owner or approved')

    this.approvals(agentId).delete()
    this.agentWallets(agentId).delete()
    this.owners(agentId).value = clone(to)
    this.decrementBalance(from.native)
    this.incrementBalance(to.native)

    emit(new arc72_Transfer({ from, to, tokenId }))
  }

  /** arc72_approve(approved, tokenId). Zero address revokes the single-token approval. */
  arc72_approve(approved: arc4.Address, tokenId: arc4.Uint256): void {
    const agentId = this.existingAgentId(tokenId)
    this.requireOwnerOrOperator(agentId)
    if (approved.native === Global.zeroAddress) {
      this.approvals(agentId).delete()
    } else {
      this.approvals(agentId).value = clone(approved)
    }
    emit(new arc72_Approval({ owner: this.ownerOfExisting(agentId), approved, tokenId }))
  }

  /** arc72_setApprovalForAll(operator, approved). */
  arc72_setApprovalForAll(operator: arc4.Address, approved: arc4.Bool): void {
    const owner = new arc4.Address(Txn.sender)
    const key = this.operatorKey(owner.bytes, operator.bytes)
    if (approved.native) {
      this.operatorApprovals(key).value = clone(approved)
    } else {
      this.operatorApprovals(key).delete()
    }
    emit(new arc72_ApprovalForAll({ owner, operator, approved }))
  }

  // --- reads ---

  /** ARC-72 metadata extension: fixed byte[256] token URI, zero-padded. */
  @arc4.abimethod({ readonly: true })
  arc72_tokenURI(tokenId: arc4.Uint256): arc4.StaticBytes<256> {
    const agentId = this.existingAgentId(tokenId)
    const uri = this.uris(agentId).value.bytes
    assert(uri.length <= 256, 'agentURI exceeds ARC-72 metadata length')
    const padded = op.replace(op.bzero(256), 0, uri)
    return new arc4.StaticBytes<256>(padded.toFixed({ length: 256 }))
  }

  /** ERC-8004-friendly string URI read; use this for the full agent registration URI. */
  @arc4.abimethod({ readonly: true })
  getAgentURI(tokenId: arc4.Uint256): arc4.Str {
    return clone(this.uris(this.existingAgentId(tokenId)).value)
  }

  /** getMetadata(id, key) -> byte[]. */
  @arc4.abimethod({ readonly: true })
  getMetadata(tokenId: arc4.Uint256, key: arc4.Str): arc4.DynamicBytes {
    const agentId = this.existingAgentId(tokenId)
    return clone(this.metadata(this.metadataKey(agentId, key.bytes)).value)
  }

  /** getAgentWallet(id) -> address, or zero address if unset. */
  @arc4.abimethod({ readonly: true })
  getAgentWallet(tokenId: arc4.Uint256): arc4.Address {
    return this.agentWallets(this.existingAgentId(tokenId)).get({ default: this.zeroAddress() })
  }

  /** arc72_getApproved(tokenId) -> address. */
  @arc4.abimethod({ readonly: true })
  arc72_getApproved(tokenId: arc4.Uint256): arc4.Address {
    const agentId = this.existingAgentId(tokenId)
    return this.approvals(agentId).get({ default: this.zeroAddress() })
  }

  /** arc72_isApprovedForAll(owner, operator) -> bool. */
  @arc4.abimethod({ readonly: true })
  arc72_isApprovedForAll(owner: arc4.Address, operator: arc4.Address): arc4.Bool {
    return this.operatorApprovals(this.operatorKey(owner.bytes, operator.bytes)).get({ default: new arc4.Bool(false) })
  }

  /** arc72_balanceOf(owner) -> uint256. */
  @arc4.abimethod({ readonly: true })
  arc72_balanceOf(owner: arc4.Address): arc4.Uint256 {
    const balance = this.balances(owner.bytes).get({ default: new arc4.Uint64(0) }).asUint64()
    return this.agentIdToTokenId(balance)
  }

  /** arc72_totalSupply() -> uint256. */
  @arc4.abimethod({ readonly: true })
  arc72_totalSupply(): arc4.Uint256 {
    return this.agentIdToTokenId(this.supply.value)
  }

  /** arc72_tokenByIndex(index) -> tokenId. */
  @arc4.abimethod({ readonly: true })
  arc72_tokenByIndex(index: arc4.Uint256): arc4.Uint256 {
    const i = this.tokenIdToUint64(index)
    assert(i < this.supply.value, 'index out of bounds')
    return this.agentIdToTokenId(this.agentAtIndex(i).value.asUint64())
  }

  /** ARC-73 interface detection. */
  @arc4.abimethod({ readonly: true })
  supportsInterface(interfaceID: arc4.StaticBytes<4>): arc4.Bool {
    const id = interfaceID.bytes
    return new arc4.Bool(
      !id.equals(new arc4.StaticBytes<4>(Bytes.fromHex('ffffffff')).bytes) &&
        (id.equals(new arc4.StaticBytes<4>(Bytes.fromHex('4e22a3ba')).bytes) ||
          id.equals(new arc4.StaticBytes<4>(Bytes.fromHex('53f02a40')).bytes) ||
          id.equals(new arc4.StaticBytes<4>(Bytes.fromHex('c3c1fc00')).bytes) ||
          id.equals(new arc4.StaticBytes<4>(Bytes.fromHex('b9c6f696')).bytes) ||
          id.equals(new arc4.StaticBytes<4>(Bytes.fromHex('a57d4679')).bytes)),
    )
  }

  // --- internals ---

  private setMetadataInternal(agentId: uint64, key: arc4.Str, value: arc4.DynamicBytes): void {
    assert(key.native !== 'agentWallet', 'agentWallet metadata is reserved')
    this.metadata(this.metadataKey(agentId, key.bytes)).value = clone(value)
    emit(new MetadataSet({ agentId: new arc4.Uint64(agentId), key, value }))
  }

  private requireOwnerOrOperator(agentId: uint64): void {
    const owner = this.ownerOfExisting(agentId)
    assert(Txn.sender === owner.native || this.operatorApproved(owner.native, Txn.sender), 'not owner or operator')
  }

  private isApprovedOrOwner(spender: Account, agentId: uint64): boolean {
    const owner = this.ownerOfExisting(agentId)
    if (spender === owner.native) return true
    if (this.approvals(agentId).exists && this.approvals(agentId).value.native === spender) return true
    return this.operatorApproved(owner.native, spender)
  }

  private operatorApproved(owner: Account, operator: Account): boolean {
    return this.operatorApprovals(this.operatorKey(owner.bytes, operator.bytes)).get({ default: new arc4.Bool(false) }).native
  }

  private existingAgentId(tokenId: arc4.Uint256): uint64 {
    const agentId = this.tokenIdToUint64(tokenId)
    assert(this.owners(agentId).exists, 'invalid tokenId')
    return agentId
  }

  private tokenIdToUint64(tokenId: arc4.Uint256): uint64 {
    assert(this.fitsUint64(tokenId), 'tokenId must fit uint64')
    return tokenId.asUint64()
  }

  private fitsUint64(tokenId: arc4.Uint256): boolean {
    return new arc4.Uint256(tokenId.asUint64()).bytes.equals(tokenId.bytes)
  }

  private agentIdToTokenId(agentId: uint64): arc4.Uint256 {
    return new arc4.Uint256(agentId)
  }

  private ownerOfExisting(agentId: uint64): arc4.Address {
    assert(this.owners(agentId).exists, 'invalid tokenId')
    return clone(this.owners(agentId).value)
  }

  private incrementBalance(owner: Account): void {
    const prev = this.balances(owner.bytes).get({ default: new arc4.Uint64(0) }).asUint64()
    this.balances(owner.bytes).value = new arc4.Uint64(prev + 1)
  }

  private decrementBalance(owner: Account): void {
    const prev = this.balances(owner.bytes).get({ default: new arc4.Uint64(0) }).asUint64()
    assert(prev > 0, 'balance underflow')
    this.balances(owner.bytes).value = new arc4.Uint64(prev - 1)
  }

  private metadataKey(agentId: uint64, key: bytes): bytes {
    return new arc4.Uint64(agentId).bytes.concat(key)
  }

  private operatorKey(owner: bytes, operator: bytes): bytes {
    return owner.concat(operator)
  }

  private zeroAddress(): arc4.Address {
    return new arc4.Address(Global.zeroAddress)
  }

}
