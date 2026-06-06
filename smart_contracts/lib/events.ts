import { arc4 } from '@algorandfoundation/algorand-typescript'

/**
 * ARC-28 event structs for the ERC-8004 Identity, Reputation & Validation registries.
 *
 * EVM `indexed` topics have no AVM analog — ARC-28 emits the whole event as one log entry
 * and indexers filter on the decoded fields (mapping §2.3 / §5.1). So the `indexed` keyword
 * from the ERC is a no-op here; field order is preserved 1:1 with the spec.
 */

// --- Identity Registry / ARC-72 (mapping §1.3) ---

export class Registered extends arc4.Struct<{
  agentId: arc4.Uint64
  agentURI: arc4.Str
  owner: arc4.Address
}> {}

export class URIUpdated extends arc4.Struct<{
  agentId: arc4.Uint64
  agentURI: arc4.Str
  owner: arc4.Address
}> {}

export class MetadataSet extends arc4.Struct<{
  agentId: arc4.Uint64
  key: arc4.Str
  value: arc4.DynamicBytes
}> {}

export class arc72_Transfer extends arc4.Struct<{
  from: arc4.Address
  to: arc4.Address
  tokenId: arc4.Uint256
}> {}

export class arc72_Approval extends arc4.Struct<{
  owner: arc4.Address
  approved: arc4.Address
  tokenId: arc4.Uint256
}> {}

export class arc72_ApprovalForAll extends arc4.Struct<{
  owner: arc4.Address
  operator: arc4.Address
  approved: arc4.Bool
}> {}

// --- Reputation Registry (mapping §2.3) ---

/**
 * ARC-28 event structs for the ERC-8004 Reputation & Validation registries.
 *
 * EVM `indexed` topics have no AVM analog — ARC-28 emits the whole event as one log entry
 * and indexers filter on the decoded fields (mapping §2.3 / §5.1). So the `indexed` keyword
 * from the ERC is a no-op here; field order is preserved 1:1 with the spec.
 */
export class NewFeedback extends arc4.Struct<{
  agentId: arc4.Uint64
  client: arc4.Address
  feedbackIndex: arc4.Uint64
  value: arc4.StaticBytes<16>
  dec: arc4.Uint8
  tag1: arc4.Str
  tag2: arc4.Str
  endpoint: arc4.Str
  feedbackURI: arc4.Str
  feedbackHash: arc4.StaticBytes<32>
}> {}

export class FeedbackRevoked extends arc4.Struct<{
  agentId: arc4.Uint64
  client: arc4.Address
  feedbackIndex: arc4.Uint64
}> {}

export class ResponseAppended extends arc4.Struct<{
  agentId: arc4.Uint64
  client: arc4.Address
  feedbackIndex: arc4.Uint64
  responder: arc4.Address
  responseURI: arc4.Str
  responseHash: arc4.StaticBytes<32>
}> {}

// --- Validation Registry (mapping §3.3) ---

export class ValidationRequest extends arc4.Struct<{
  validator: arc4.Address
  agentId: arc4.Uint64
  requestURI: arc4.Str
  requestHash: arc4.StaticBytes<32>
}> {}

export class ValidationResponse extends arc4.Struct<{
  validator: arc4.Address
  agentId: arc4.Uint64
  requestHash: arc4.StaticBytes<32>
  response: arc4.Uint8
  responseURI: arc4.Str
  responseHash: arc4.StaticBytes<32>
  tag: arc4.Str
}> {}
