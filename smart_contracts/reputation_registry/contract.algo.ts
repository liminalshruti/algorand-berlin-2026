import {
  Account,
  arc4,
  assert,
  BigUint,
  biguint,
  BoxMap,
  bytes,
  clone,
  emit,
  Global,
  GlobalState,
  op,
  Txn,
  uint64,
} from '@algorandfoundation/algorand-typescript'
import { FeedbackRevoked, NewFeedback, ResponseAppended } from '../lib/events'
import { encodeNetI128, isNegativeI128, magnitudeI128 } from '../lib/int128'

/**
 * ERC-8004 Reputation Registry, ported to the AVM (ref/ERC8004_AVM_MAPPING.md §2).
 *
 * Stores bounded feedback from clients about registered agents. Per spec, only
 * value/dec/tag1/tag2/isRevoked are persisted; endpoint/feedbackURI/feedbackHash are
 * emitted (ARC-28) but not stored. Hashes are caller-provided keccak-256 commitments.
 *
 * Identity link is DEFERRED (by design): existence + owner come from a local owner
 * registry (`setAgentOwner`) used for dev/test. In production, set `identityAppId` via
 * `initialize` and resolve owner through the Identity app — a one-method change in
 * `resolveOwner`. While the owner is unknown (zero), owner-dependent guards are skipped.
 */

/** Stored feedback row (mapping §2.1). */
export class FeedbackRow extends arc4.Struct<{
  value: arc4.StaticBytes<16>
  dec: arc4.Uint8
  tag1: arc4.Str
  tag2: arc4.Str
  isRevoked: arc4.Bool
}> {}

/** getSummary return: (count, summaryValue:int128, summaryValueDecimals). */
export class FeedbackSummary extends arc4.Struct<{
  count: arc4.Uint64
  value: arc4.StaticBytes<16>
  dec: arc4.Uint8
}> {}

/** readAllFeedback element — array-of-structs (idiomatic ARC-4 shape for the §2 struct-of-arrays). */
export class FeedbackEntry extends arc4.Struct<{
  client: arc4.Address
  feedbackIndex: arc4.Uint64
  value: arc4.StaticBytes<16>
  dec: arc4.Uint8
  tag1: arc4.Str
  tag2: arc4.Str
  isRevoked: arc4.Bool
}> {}

export class ReputationRegistry extends arc4.Contract {
  /** Identity app id; 0 = deferred (owner resolved from local registry). */
  identityAppId = GlobalState<uint64>({ key: 'idApp', initialValue: 0 })

  /** last feedbackIndex per (agentId, client). key = agentId(8) ++ client(32) */
  lastIndex = BoxMap<bytes, arc4.Uint64>({ keyPrefix: 'li' })
  /** feedback row. key = agentId(8) ++ client(32) ++ index(8) */
  feedback = BoxMap<bytes, FeedbackRow>({ keyPrefix: 'fb' })
  /** clients that have given feedback, per agent. key = agentId */
  clientList = BoxMap<uint64, arc4.DynamicArray<arc4.Address>>({ keyPrefix: 'cl' })
  /** response count. key = agentId(8) ++ client(32) ++ index(8) ++ responder(32) */
  respCount = BoxMap<bytes, arc4.Uint64>({ keyPrefix: 'rc' })
  /** DEFERRED identity seam: local owner registry. key = agentId */
  owners = BoxMap<uint64, arc4.Address>({ keyPrefix: 'own' })

  // --- lifecycle ---

  /** Set the Identity registry app id (0 keeps the owner guards on the local registry). */
  initialize(identityApp: uint64): void {
    this.identityAppId.value = identityApp
  }

  /**
   * DEV/TEST seam (deferred identity): register an agent's owner locally so the
   * self-feedback prohibition can be exercised without the Identity app.
   */
  setAgentOwner(agentId: uint64, owner: arc4.Address): void {
    this.owners(agentId).value = owner
  }

  // --- writes ---

  /** giveFeedback (mapping §2.2). Caller MUST NOT be the agent owner (self-feedback prohibition). */
  giveFeedback(
    agentId: uint64,
    value: arc4.StaticBytes<16>,
    dec: arc4.Uint8,
    tag1: arc4.Str,
    tag2: arc4.Str,
    endpoint: arc4.Str,
    feedbackURI: arc4.Str,
    feedbackHash: arc4.StaticBytes<32>,
  ): void {
    assert(dec.asUint64() <= 18, 'valueDecimals must be 0..18')
    this.requireNotSelf(agentId)

    const client = Txn.sender.bytes
    const liKey = this.acKey(agentId, client)
    const isNewClient = !this.lastIndex(liKey).exists
    const nextIdx: uint64 = isNewClient ? 1 : this.lastIndex(liKey).value.asUint64() + 1
    this.lastIndex(liKey).value = new arc4.Uint64(nextIdx)

    this.feedback(this.fbKey(agentId, client, nextIdx)).value = new FeedbackRow({
      value: clone(value),
      dec: clone(dec),
      tag1: clone(tag1),
      tag2: clone(tag2),
      isRevoked: new arc4.Bool(false),
    })

    if (isNewClient) {
      const clientAddr = new arc4.Address(Txn.sender)
      if (this.clientList(agentId).exists) {
        const list = clone(this.clientList(agentId).value)
        list.push(clientAddr)
        this.clientList(agentId).value = clone(list)
      } else {
        this.clientList(agentId).value = new arc4.DynamicArray<arc4.Address>(clientAddr)
      }
    }

    emit(
      new NewFeedback({
        agentId: new arc4.Uint64(agentId),
        client: new arc4.Address(Txn.sender),
        feedbackIndex: new arc4.Uint64(nextIdx),
        value,
        dec,
        tag1,
        tag2,
        endpoint,
        feedbackURI,
        feedbackHash,
      }),
    )
  }

  /** revokeFeedback (mapping §2.2). Caller MUST be the original client — enforced by the key. */
  revokeFeedback(agentId: uint64, feedbackIndex: uint64): void {
    const key = this.fbKey(agentId, Txn.sender.bytes, feedbackIndex)
    assert(this.feedback(key).exists, 'no such feedback for caller')
    const row = clone(this.feedback(key).value)
    row.isRevoked = new arc4.Bool(true)
    this.feedback(key).value = clone(row)

    emit(
      new FeedbackRevoked({
        agentId: new arc4.Uint64(agentId),
        client: new arc4.Address(Txn.sender),
        feedbackIndex: new arc4.Uint64(feedbackIndex),
      }),
    )
  }

  /** appendResponse (mapping §2.2). Callable by anyone. */
  appendResponse(
    agentId: uint64,
    client: arc4.Address,
    feedbackIndex: uint64,
    responseURI: arc4.Str,
    responseHash: arc4.StaticBytes<32>,
  ): void {
    const key = this.rcKey(agentId, client.bytes, feedbackIndex, Txn.sender.bytes)
    const prev = this.respCount(key).get({ default: new arc4.Uint64(0) }).asUint64()
    this.respCount(key).value = new arc4.Uint64(prev + 1)

    emit(
      new ResponseAppended({
        agentId: new arc4.Uint64(agentId),
        client,
        feedbackIndex: new arc4.Uint64(feedbackIndex),
        responder: new arc4.Address(Txn.sender),
        responseURI,
        responseHash,
      }),
    )
  }

  // --- reads (readonly) ---

  /** getSummary (mapping §2.2). clientAddresses MUST be non-empty (Sybil guard). */
  @arc4.abimethod({ readonly: true })
  getSummary(
    agentId: uint64,
    clientAddresses: arc4.DynamicArray<arc4.Address>,
    tag1: arc4.Str,
    tag2: arc4.Str,
  ): FeedbackSummary {
    assert(clientAddresses.length > 0, 'clientAddresses must be non-empty')
    let count: uint64 = 0
    let dec: uint64 = 0
    let posSum: biguint = BigUint(0)
    let negSum: biguint = BigUint(0)

    for (const ca of clientAddresses) {
      const client = ca.bytes
      const liKey = this.acKey(agentId, client)
      if (!this.lastIndex(liKey).exists) continue
      const last = this.lastIndex(liKey).value.asUint64()
      for (let i: uint64 = 1; i <= last; i += 1) {
        const fbKey = this.fbKey(agentId, client, i)
        if (!this.feedback(fbKey).exists) continue
        const row = clone(this.feedback(fbKey).value)
        if (row.isRevoked.native) continue
        if (!this.tagMatches(tag1, row.tag1) || !this.tagMatches(tag2, row.tag2)) continue
        count += 1
        dec = row.dec.asUint64()
        const v: bytes = row.value.native
        if (isNegativeI128(v)) {
          negSum = BigUint(negSum + magnitudeI128(v))
        } else {
          posSum = BigUint(posSum + magnitudeI128(v))
        }
      }
    }

    return new FeedbackSummary({
      count: new arc4.Uint64(count),
      value: encodeNetI128(posSum, negSum),
      dec: new arc4.Uint8(dec),
    })
  }

  /** readFeedback (mapping §2.2). */
  @arc4.abimethod({ readonly: true })
  readFeedback(agentId: uint64, client: arc4.Address, feedbackIndex: uint64): FeedbackRow {
    const key = this.fbKey(agentId, client.bytes, feedbackIndex)
    assert(this.feedback(key).exists, 'no such feedback')
    return clone(this.feedback(key).value)
  }

  /** readAllFeedback (mapping §2.2). Revoked omitted unless includeRevoked. */
  @arc4.abimethod({ readonly: true })
  readAllFeedback(
    agentId: uint64,
    clientAddresses: arc4.DynamicArray<arc4.Address>,
    tag1: arc4.Str,
    tag2: arc4.Str,
    includeRevoked: boolean,
  ): arc4.DynamicArray<FeedbackEntry> {
    const out = new arc4.DynamicArray<FeedbackEntry>()
    for (const ca of clientAddresses) {
      const client = ca.bytes
      const liKey = this.acKey(agentId, client)
      if (!this.lastIndex(liKey).exists) continue
      const last = this.lastIndex(liKey).value.asUint64()
      for (let i: uint64 = 1; i <= last; i += 1) {
        const fbKey = this.fbKey(agentId, client, i)
        if (!this.feedback(fbKey).exists) continue
        const row = clone(this.feedback(fbKey).value)
        if (row.isRevoked.native && !includeRevoked) continue
        if (!this.tagMatches(tag1, row.tag1) || !this.tagMatches(tag2, row.tag2)) continue
        out.push(
          new FeedbackEntry({
            client: clone(ca),
            feedbackIndex: new arc4.Uint64(i),
            value: clone(row.value),
            dec: clone(row.dec),
            tag1: clone(row.tag1),
            tag2: clone(row.tag2),
            isRevoked: clone(row.isRevoked),
          }),
        )
      }
    }
    return out
  }

  /** getResponseCount (mapping §2.2). */
  @arc4.abimethod({ readonly: true })
  getResponseCount(
    agentId: uint64,
    client: arc4.Address,
    feedbackIndex: uint64,
    responders: arc4.DynamicArray<arc4.Address>,
  ): arc4.Uint64 {
    let total: uint64 = 0
    for (const r of responders) {
      const key = this.rcKey(agentId, client.bytes, feedbackIndex, r.bytes)
      total += this.respCount(key).get({ default: new arc4.Uint64(0) }).asUint64()
    }
    return new arc4.Uint64(total)
  }

  /** getClients (mapping §2.2). */
  @arc4.abimethod({ readonly: true })
  getClients(agentId: uint64): arc4.DynamicArray<arc4.Address> {
    return clone(this.clientList(agentId).get({ default: new arc4.DynamicArray<arc4.Address>() }))
  }

  /** getLastIndex (mapping §2.2). */
  @arc4.abimethod({ readonly: true })
  getLastIndex(agentId: uint64, client: arc4.Address): arc4.Uint64 {
    return this.lastIndex(this.acKey(agentId, client.bytes)).get({ default: new arc4.Uint64(0) })
  }

  /** getIdentityRegistry (mapping §2). */
  @arc4.abimethod({ readonly: true })
  getIdentityRegistry(): arc4.Uint64 {
    return new arc4.Uint64(this.identityAppId.value)
  }

  // --- internals ---

  /** Resolve an agent's owner. DEFERRED: local registry today; Identity app when wired. */
  private resolveOwner(agentId: uint64): Account {
    return this.owners(agentId).get({ default: new arc4.Address(Global.zeroAddress) }).native
  }

  /** Self-feedback prohibition — enforced only once the owner is known (deferred otherwise). */
  private requireNotSelf(agentId: uint64): void {
    const owner = this.resolveOwner(agentId)
    if (owner !== Global.zeroAddress) {
      assert(Txn.sender !== owner, 'self-feedback prohibited')
    }
  }

  /** Empty filter matches all; otherwise exact match. */
  private tagMatches(filter: arc4.Str, actual: arc4.Str): boolean {
    return filter.native === '' || filter.bytes.equals(actual.bytes)
  }

  private acKey(agentId: uint64, client: bytes): bytes {
    return new arc4.Uint64(agentId).bytes.concat(client)
  }

  private fbKey(agentId: uint64, client: bytes, index: uint64): bytes {
    return new arc4.Uint64(agentId).bytes.concat(client).concat(new arc4.Uint64(index).bytes)
  }

  private rcKey(agentId: uint64, client: bytes, index: uint64, responder: bytes): bytes {
    // agentId(8)+client(32)+index(8)+responder(32) = 80B exceeds the 64B AVM box-key limit,
    // so hash it to a fixed 32 bytes.
    return op.sha256(
      new arc4.Uint64(agentId).bytes.concat(client).concat(new arc4.Uint64(index).bytes).concat(responder),
    )
  }
}
