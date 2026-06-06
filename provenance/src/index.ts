// Public surface of the Liminal provenance slice.

export { CANONICAL_VERSION, DOMAIN_TAG, canonicalize, hashCanonical } from "./canonical.ts";
export {
  type AgentRead,
  type CorrectionKind,
  type Packet,
  type RuntimeMode,
  type SignedPacket,
  canonicalPacket,
  signPacket,
} from "./packet.ts";
export {
  type AnchorChain,
  type AnchorNote,
  type AnchorReceipt,
  type Clock,
  NOTE_SCHEMA,
  type OnChainAnchor,
  type VerifierMetadata,
  systemClock,
} from "./chain/types.ts";
export { MockAnchorChain } from "./chain/mock.ts";
export { type AlgoNetwork, AlgorandAnchorChain } from "./chain/algorand.ts";
export { type EventKind, type VaultEvent, type VaultRow, Vault } from "./vault.ts";
export { type VerifyResult, verifyPacket } from "./verify.ts";

// Correction stream + projection gate (PPA #5 substrate — drop → read → correct → sign)
export { type ProjectableEventLike, isProjectable } from "./projection.ts";
export {
  type CorrectionProvenance,
  type CorrectionRecord,
  type CorrectionRequest,
  type ProjectedCorrection,
  VALID_CORRECTION_KINDS,
  projectCorrections,
  recordCorrection,
} from "./correction.ts";
export { type DecisionTag, VALID_DECISION_TAGS, isValidDecisionTag } from "./decision-tags.ts";
export {
  type AuditedCallInput,
  type AuditedCallOutput,
  type CallInvocationResult,
  auditedCall,
} from "./audit.ts";

// x402 settlement layer (Berlin "Agentic Commerce x402") — shaped to algorandfoundation/x402-demo
export {
  type Asset,
  type PaymentBinding,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type SettleResponse,
  type VerifyResponse,
  ALGORAND_LOCALNET,
  ALGORAND_MAINNET,
  ALGORAND_MOCK,
  ALGORAND_TESTNET,
  X402_VERSION,
  bindingFor,
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  encodePaymentSignatureHeader,
  networkId,
} from "./x402/types.ts";
export {
  type Facilitator,
  type Payer,
  AlgorandFacilitator,
  AlgorandPayer,
  MockFacilitator,
  MockPayer,
  peekAuthorization,
} from "./x402/facilitator.ts";
export {
  type LaneCheck,
  type PricedAgent,
  type Register,
  type Task,
  AgentRegistry,
  checkLane,
} from "./x402/agent.ts";
export {
  type GateResponse,
  type PricedEndpointOptions,
  PricedEndpoint,
  resourceId,
  x402Exchange,
} from "./x402/gate.ts";
