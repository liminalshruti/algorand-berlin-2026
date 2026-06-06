// Canonical decision_tag taxonomy for per-call audit (Algorand lane).
//
// Every audited agent action carries exactly one of these tags on its `agent.call` event. The
// forensic read of a session walks this taxonomy without re-running any work.
//
//   serve_priced_read   — a PricedEndpoint served an in-lane read after settlement
//   settle_payment      — the facilitator settled an x402 payment on chain
//   anchor_packet       — a packet hash was anchored on Algorand
//   classify_correction — a user correction was classified into a kind

export type DecisionTag =
  | "serve_priced_read"
  | "settle_payment"
  | "anchor_packet"
  | "classify_correction";

export const VALID_DECISION_TAGS: DecisionTag[] = [
  "serve_priced_read",
  "settle_payment",
  "anchor_packet",
  "classify_correction",
];

export function isValidDecisionTag(s: string): s is DecisionTag {
  return VALID_DECISION_TAGS.includes(s as DecisionTag);
}
