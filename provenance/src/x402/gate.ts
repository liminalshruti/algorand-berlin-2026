// x402 priced endpoint — the resource-server gate (Sean lane · Berlin AlgoHack).
//
// Mirrors the official paymentMiddleware flow (algorandfoundation/x402-demo server/hono), with two
// Liminal additions layered on top:
//   1. structural guard FIRST — out-of-lane work is refused for FREE (200, no charge), naming the
//      right agent. You cannot be billed for work outside your domain. This is the Berlin pitch's
//      "structural guards prevent commerce-rogue behavior."
//   2. in-lane → issue a 402 PAYMENT-REQUIRED challenge → facilitator.verify → serve →
//      facilitator.settle (two-phase) → (optionally) anchor the delivered packet via provenance.
//      One unified receipt: paid here, proven here.
//
// Settlement (x402) and proof (provenance) ride the same Algorand substrate (chain/algorand-client).

import { type AnchorChain, type AnchorReceipt, type Clock, systemClock } from "../chain/types.ts";
import { type AgentRead, type Packet } from "../packet.ts";
import { type Vault } from "../vault.ts";
import { auditedCall } from "../audit.ts";
import { type DecisionTag } from "../decision-tags.ts";
import { type AgentRegistry, type PricedAgent, type Task, checkLane } from "./agent.ts";
import { type Facilitator, peekAuthorization } from "./facilitator.ts";
import { type PaymentPayload, type PaymentRequirements, type SettleResponse } from "./types.ts";

export type GateResponse =
  | { status: 200; outcome: "refused-free"; refusal: string; referTo: string | null }
  | { status: 402; outcome: "payment-required"; requirements: PaymentRequirements }
  | { status: 402; outcome: "payment-invalid"; reason: string; settlement: SettleResponse | null; requirements: PaymentRequirements }
  | { status: 200; outcome: "paid"; read: AgentRead; settlement: SettleResponse; anchor: AnchorReceipt | null };

export interface PricedEndpointOptions {
  /** When both are provided, the delivered packet is anchored after settlement (settlement + proof). */
  vault?: Vault;
  anchorChain?: AnchorChain;
  /** Injectable nonce source (deterministic tests). Default: a per-endpoint counter. */
  nonceFor?: (task: Task) => string;
  /** Injectable clock for packet timestamps when settlement carries none. */
  clock?: Clock;
  /** Default timeout advertised in the 402 challenge. */
  maxTimeoutSeconds?: number;
}

export class PricedEndpoint {
  private readonly agent: PricedAgent;
  private readonly facilitator: Facilitator;
  private readonly registry: AgentRegistry;
  private readonly opts: PricedEndpointOptions;
  private readonly clock: Clock;
  // Issued-but-unsettled challenges, keyed by nonce. Models a real server's pending state.
  private readonly pending = new Map<string, PaymentRequirements>();
  private nonceCounter = 0;

  constructor(agent: PricedAgent, facilitator: Facilitator, registry: AgentRegistry, opts: PricedEndpointOptions = {}) {
    this.agent = agent;
    this.facilitator = facilitator;
    this.registry = registry;
    this.opts = opts;
    this.clock = opts.clock ?? systemClock;
  }

  /**
   * Handle a request. Call once with no payment to get the 402 challenge; call again with the
   * `PAYMENT-SIGNATURE` payload to verify, settle, and be served.
   */
  async serve(task: Task, payment?: PaymentPayload): Promise<GateResponse> {
    // 1. Structural guard — refuse out-of-lane work for free, before any pricing.
    const lane = checkLane(this.agent, task, this.registry);
    if (!lane.inLane) {
      const refersTo = lane.referTo ? ` Route to ${lane.referTo}.` : "";
      const refusal = `${this.agent.name} refuses: ${task.register} work is outside the ${this.agent.register} lane.${refersTo}`;
      // Refusal is a first-class output — record it. A free refusal is still an event, not an error.
      this.opts.vault?.write("lane.refusal", {
        agent: this.agent.name,
        register: this.agent.register,
        task_id: task.id,
        task_register: task.register,
        refer_to: lane.referTo,
        refusal,
      });
      return { status: 200, outcome: "refused-free", refusal, referTo: lane.referTo };
    }

    const resource = resourceId(this.agent, task);

    // 2. In-lane but unpaid → issue a 402 challenge bound to a single-use nonce.
    if (!payment) {
      const req = this.challenge(task, resource);
      this.pending.set(req.nonce, req);
      return { status: 402, outcome: "payment-required", requirements: req };
    }

    // 3. In-lane and paid → match the issued challenge, verify, settle, serve.
    const auth = peekAuthorization(payment);
    const req = auth ? this.pending.get(auth.nonce) : undefined;
    if (!auth || !req || req.resource !== resource) {
      return {
        status: 402,
        outcome: "payment-invalid",
        reason: "unknown or expired challenge",
        settlement: null,
        requirements: this.challenge(task, resource), // a fresh challenge to retry against
      };
    }

    // 3a. verify (off-chain) — does the authorization satisfy the requirements?
    const verification = await this.facilitator.verify(payment, req);
    if (!verification.isValid) {
      return { status: 402, outcome: "payment-invalid", reason: verification.invalidReason ?? "invalid payment", settlement: null, requirements: req };
    }

    // 3b. settle (on-chain) — submit and confirm. Audited when a vault is attached.
    const settlement = await this.runAudited(
      "settle_payment",
      { resource: req.resource, nonce: req.nonce, network: this.facilitator.network },
      () => this.facilitator.settle(payment, req),
    );
    if (!settlement.success) {
      return { status: 402, outcome: "payment-invalid", reason: settlement.errorReason ?? "settlement failed", settlement, requirements: req };
    }
    this.pending.delete(req.nonce); // challenge consumed

    const read = await this.runAudited(
      "serve_priced_read",
      { agent: this.agent.name, register: this.agent.register, task_id: task.id },
      () => this.agent.serve(task),
    );
    const anchor = await this.maybeAnchor(task, read, settlement);
    return { status: 200, outcome: "paid", read, settlement, anchor };
  }

  private challenge(task: Task, resource: string): PaymentRequirements {
    const nonce = this.opts.nonceFor?.(task) ?? `n-${this.agent.name}-${++this.nonceCounter}`;
    return {
      scheme: "exact",
      network: this.facilitator.network,
      amount: this.agent.price,
      asset: this.agent.asset,
      resource,
      description: `${this.agent.name} (${this.agent.register}) read of task ${task.id}`,
      mimeType: "application/json",
      payTo: this.agent.payTo,
      nonce,
      maxTimeoutSeconds: this.opts.maxTimeoutSeconds ?? 60,
    };
  }

  // After settlement, optionally anchor the delivered packet so the buyer has paid-here-proven-here.
  private async maybeAnchor(task: Task, read: AgentRead, settlement: SettleResponse): Promise<AnchorReceipt | null> {
    const { vault, anchorChain } = this.opts;
    if (!vault || !anchorChain) return null;
    const packet: Packet = {
      id: `pkt_${task.id}_${this.agent.name}`,
      context: task.prompt,
      user_correction: null,
      chosen_agent: this.agent.name,
      correction_kind: null,
      runtime_mode: "live",
      created_at: settlement.settledAt ?? this.clock(),
      agent_reads: [read],
    };
    vault.save(packet);
    return vault.anchorPacket(packet.id, anchorChain);
  }

  // Run an action, recording one agent.call audit event when a vault is attached (else just run
  // it). Wraps both the on-chain settle and the priced serve so the audit chain has one row per call.
  private async runAudited<T>(tag: DecisionTag, extra: Record<string, unknown>, invoke: () => T | Promise<T>): Promise<T> {
    const vault = this.opts.vault;
    if (!vault) return invoke();
    const out = await auditedCall(vault, {
      decision_tag: tag,
      runtime: "live",
      extra,
      invoke: async () => ({ result: await invoke(), input_tokens: 0, output_tokens: 0 }),
    });
    return out.result;
  }
}

export function resourceId(agent: PricedAgent, task: Task): string {
  return `read:${agent.name}:${task.id}`;
}

/**
 * Drive a full x402 exchange the way a client would: request → receive 402 → sign payment → retry.
 * A `refused-free` response short-circuits with no payment. The Payer signs; the endpoint's
 * facilitator settles.
 */
export async function x402Exchange(
  endpoint: PricedEndpoint,
  task: Task,
  payer: { createPayment(req: PaymentRequirements): Promise<PaymentPayload> },
): Promise<GateResponse> {
  const first = await endpoint.serve(task);
  if (first.status !== 402 || first.outcome !== "payment-required") return first;
  const payment = await payer.createPayment(first.requirements);
  return endpoint.serve(task, payment);
}
