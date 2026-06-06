// Per-call audit wrapper (lifted from liminal-notion-hack/src/agents/call.ts).
//
// Every settled / served / anchored agent action goes through this wrapper, which emits EXACTLY
// ONE `agent.call` event into the vault: { decision_tag, model, runtime, latency_ms, input_tokens,
// output_tokens, ...extra }. The forensic invariant: N audited calls => N agent.call rows.
//
// Adapted from notion: dropped the Anthropic SDK coupling (MODEL_ID / RuntimeChoice); runtime is
// the repo's own RuntimeMode and model is caller-supplied (this slice has no LLM call to tag).

import type { Vault } from "./vault.ts";
import type { RuntimeMode } from "./packet.ts";
import { VALID_DECISION_TAGS, type DecisionTag } from "./decision-tags.ts";

export interface CallInvocationResult<T> {
  result: T;
  input_tokens: number;
  output_tokens: number;
}

export interface AuditedCallInput<T> {
  decision_tag: DecisionTag;
  runtime: RuntimeMode;
  invoke: () => Promise<CallInvocationResult<T>>;
  model?: string | null;
  extra?: Record<string, unknown>;
}

export interface AuditedCallOutput<T> {
  result: T;
  agent_call_id: string;
  decision_tag: DecisionTag;
  runtime: RuntimeMode;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export async function auditedCall<T>(
  vault: Vault,
  input: AuditedCallInput<T>,
): Promise<AuditedCallOutput<T>> {
  if (!VALID_DECISION_TAGS.includes(input.decision_tag)) {
    throw new Error(`decision_tag "${input.decision_tag}" is not in the canonical taxonomy`);
  }
  const t0 = Date.now();
  const inv = await input.invoke();
  const latency_ms = Date.now() - t0;

  const evt = vault.write("agent.call", {
    decision_tag: input.decision_tag,
    model: input.model ?? null,
    runtime: input.runtime,
    latency_ms,
    input_tokens: inv.input_tokens,
    output_tokens: inv.output_tokens,
    ...(input.extra ?? {}),
  });

  return {
    result: inv.result,
    agent_call_id: evt.id,
    decision_tag: input.decision_tag,
    runtime: input.runtime,
    latency_ms,
    input_tokens: inv.input_tokens,
    output_tokens: inv.output_tokens,
  };
}

export { VALID_DECISION_TAGS, type DecisionTag };
