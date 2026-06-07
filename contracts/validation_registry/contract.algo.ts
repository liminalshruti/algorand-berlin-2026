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
  Txn,
  uint64,
} from '@algorandfoundation/algorand-typescript'
import { ValidationRequest, ValidationResponse } from '../lib/events'

/**
 * ERC-8004 Validation Registry, ported to the AVM (docs/reference/ERC8004_AVM_MAPPING.md §3).
 *
 * Records validation requests (keyed by a keccak-256 requestHash) and the validator's
 * response (0..100). validationResponse is callable multiple times for the same request
 * — progressive finality (e.g. "soft" then "hard") via overwrite + lastUpdate bump.
 *
 * Identity link is DEFERRED (same seam as the Reputation registry): the
 * "caller MUST be owner/operator of agentId" guard on validationRequest is enforced only
 * once an owner is known (set locally via `setAgentOwner` for dev/test, or via the Identity
 * app in production). Validator backends (re-execution, zkML, TEE) are off-chain & unchanged.
 */

const ZERO32: bytes = Bytes.fromHex('0000000000000000000000000000000000000000000000000000000000000000')

/** Stored validation record (mapping §3.1). */
export class ValidationRecord extends arc4.Struct<{
  validator: arc4.Address
  agentId: arc4.Uint64
  response: arc4.Uint8
  responseHash: arc4.StaticBytes<32>
  tag: arc4.Str
  lastUpdate: arc4.Uint64
}> {}

/** getSummary return: (count, averageResponse). */
export class ValidationSummary extends arc4.Struct<{
  count: arc4.Uint64
  averageResponse: arc4.Uint8
}> {}

export class ValidationRegistry extends arc4.Contract {
  /** Identity app id; 0 = deferred (owner resolved from local registry). */
  identityAppId = GlobalState<uint64>({ key: 'idApp', initialValue: 0 })

  /** validation record. key = requestHash(32) */
  validation = BoxMap<bytes, ValidationRecord>({ keyPrefix: 'vr' })
  /** agent -> request hashes. key = agentId */
  agentValidations = BoxMap<uint64, arc4.DynamicArray<arc4.StaticBytes<32>>>({ keyPrefix: 'av' })
  /** validator -> request hashes. key = validator address(32) */
  validatorRequests = BoxMap<bytes, arc4.DynamicArray<arc4.StaticBytes<32>>>({ keyPrefix: 'vq' })
  /** DEFERRED identity seam: local owner registry. key = agentId */
  owners = BoxMap<uint64, arc4.Address>({ keyPrefix: 'own' })

  // --- lifecycle ---

  /** Set the Identity registry app id (0 keeps the owner guard on the local registry). */
  initialize(identityApp: uint64): void {
    this.identityAppId.value = identityApp
  }

  /** DEV/TEST seam (deferred identity): register an agent's owner locally. */
  setAgentOwner(agentId: uint64, owner: arc4.Address): void {
    this.owners(agentId).value = owner
  }

  // --- writes ---

  /** validationRequest (mapping §3.2). Caller MUST be owner/operator of agentId. */
  validationRequest(
    validator: arc4.Address,
    agentId: uint64,
    requestURI: arc4.Str,
    requestHash: arc4.StaticBytes<32>,
  ): void {
    this.requireOwnerOrOperator(agentId)
    assert(!this.validation(requestHash.bytes).exists, 'request already exists')

    this.validation(requestHash.bytes).value = new ValidationRecord({
      validator: clone(validator),
      agentId: new arc4.Uint64(agentId),
      response: new arc4.Uint8(0),
      responseHash: new arc4.StaticBytes<32>(ZERO32),
      tag: new arc4.Str(''),
      lastUpdate: new arc4.Uint64(Global.latestTimestamp),
    })

    if (this.agentValidations(agentId).exists) {
      const list = clone(this.agentValidations(agentId).value)
      list.push(clone(requestHash))
      this.agentValidations(agentId).value = clone(list)
    } else {
      this.agentValidations(agentId).value = new arc4.DynamicArray<arc4.StaticBytes<32>>(clone(requestHash))
    }
    const vKey = validator.bytes
    if (this.validatorRequests(vKey).exists) {
      const list = clone(this.validatorRequests(vKey).value)
      list.push(clone(requestHash))
      this.validatorRequests(vKey).value = clone(list)
    } else {
      this.validatorRequests(vKey).value = new arc4.DynamicArray<arc4.StaticBytes<32>>(clone(requestHash))
    }

    emit(
      new ValidationRequest({
        validator,
        agentId: new arc4.Uint64(agentId),
        requestURI,
        requestHash,
      }),
    )
  }

  /**
   * validationResponse (mapping §3.2). Caller MUST be the named validator; response in 0..100.
   * Callable repeatedly for the same request (progressive finality) — overwrites + bumps lastUpdate.
   */
  validationResponse(
    requestHash: arc4.StaticBytes<32>,
    response: arc4.Uint8,
    responseURI: arc4.Str,
    responseHash: arc4.StaticBytes<32>,
    tag: arc4.Str,
  ): void {
    assert(this.validation(requestHash.bytes).exists, 'no such validation request')
    assert(response.asUint64() <= 100, 'response must be 0..100')
    const record = clone(this.validation(requestHash.bytes).value)
    assert(Txn.sender === record.validator.native, 'only the named validator may respond')

    record.response = clone(response)
    record.responseHash = clone(responseHash)
    record.tag = clone(tag)
    record.lastUpdate = new arc4.Uint64(Global.latestTimestamp)
    this.validation(requestHash.bytes).value = clone(record)

    emit(
      new ValidationResponse({
        validator: clone(record.validator),
        agentId: clone(record.agentId),
        requestHash,
        response,
        responseURI,
        responseHash,
        tag,
      }),
    )
  }

  // --- reads (readonly) ---

  /** getValidationStatus (mapping §3.2). */
  @arc4.abimethod({ readonly: true })
  getValidationStatus(requestHash: arc4.StaticBytes<32>): ValidationRecord {
    assert(this.validation(requestHash.bytes).exists, 'no such validation request')
    return clone(this.validation(requestHash.bytes).value)
  }

  /** getSummary (mapping §3.2). Empty validators list = all validators. */
  @arc4.abimethod({ readonly: true })
  getSummary(
    agentId: uint64,
    validators: arc4.DynamicArray<arc4.Address>,
    tag: arc4.Str,
  ): ValidationSummary {
    let count: uint64 = 0
    let sum: uint64 = 0
    const hashes = clone(this.agentValidations(agentId).get({ default: new arc4.DynamicArray<arc4.StaticBytes<32>>() }))
    for (const rh of hashes) {
      if (!this.validation(rh.bytes).exists) continue
      const record = clone(this.validation(rh.bytes).value)
      if (!this.validatorMatches(validators, record.validator.native)) continue
      if (!this.tagMatches(tag, record.tag)) continue
      count += 1
      sum += record.response.asUint64()
    }
    const avg: uint64 = count > 0 ? sum / count : 0
    return new ValidationSummary({ count: new arc4.Uint64(count), averageResponse: new arc4.Uint8(avg) })
  }

  /** getAgentValidations (mapping §3.2). */
  @arc4.abimethod({ readonly: true })
  getAgentValidations(agentId: uint64): arc4.DynamicArray<arc4.StaticBytes<32>> {
    return clone(this.agentValidations(agentId).get({ default: new arc4.DynamicArray<arc4.StaticBytes<32>>() }))
  }

  /** getValidatorRequests (mapping §3.2). */
  @arc4.abimethod({ readonly: true })
  getValidatorRequests(validator: arc4.Address): arc4.DynamicArray<arc4.StaticBytes<32>> {
    return clone(this.validatorRequests(validator.bytes).get({ default: new arc4.DynamicArray<arc4.StaticBytes<32>>() }))
  }

  /** getIdentityRegistry (mapping §3). */
  @arc4.abimethod({ readonly: true })
  getIdentityRegistry(): arc4.Uint64 {
    return new arc4.Uint64(this.identityAppId.value)
  }

  // --- internals ---

  private resolveOwner(agentId: uint64): Account {
    return this.owners(agentId).get({ default: new arc4.Address(Global.zeroAddress) }).native
  }

  /** Owner/operator guard — enforced only once the owner is known (deferred otherwise). */
  private requireOwnerOrOperator(agentId: uint64): void {
    const owner = this.resolveOwner(agentId)
    if (owner !== Global.zeroAddress) {
      assert(Txn.sender === owner, 'only owner/operator of agentId')
    }
  }

  private validatorMatches(validators: arc4.DynamicArray<arc4.Address>, who: Account): boolean {
    if (validators.length === 0) return true
    for (const v of validators) {
      if (v.native === who) return true
    }
    return false
  }

  private tagMatches(filter: arc4.Str, actual: arc4.Str): boolean {
    return filter.native === '' || filter.bytes.equals(actual.bytes)
  }
}
