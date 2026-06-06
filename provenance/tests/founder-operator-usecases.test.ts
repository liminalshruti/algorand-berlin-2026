// Founder/operator use-case matrix.
//
// These are not new protocol primitives; they prove the same Berlin loop holds across practical
// founder operating work: priced in-lane reads settle and anchor, corrections become first-class
// data, emergence stays local, and misrouted work is refused for free before payment.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAnchorChain } from "../src/chain/mock.ts";
import { recordCorrection, projectCorrections } from "../src/correction.ts";
import { signPacket, type CorrectionKind, type Packet } from "../src/packet.ts";
import { Vault } from "../src/vault.ts";
import { verifyPacket } from "../src/verify.ts";
import { AgentRegistry, type PricedAgent, type Register, type Task } from "../src/x402/agent.ts";
import { MockFacilitator, MockPayer } from "../src/x402/facilitator.ts";
import { PricedEndpoint, x402Exchange } from "../src/x402/gate.ts";

const clock = () => "2026-06-06T10:00:00.000Z";

interface FounderOperatorUseCase {
  name: string;
  task: Task;
  agent: "Analyst" | "SDR" | "Strategist" | "Operator";
  wrongAgent: "Analyst" | "SDR" | "Strategist" | "Operator";
  correction_kind: CorrectionKind;
  correctionNote: string;
}

const useCases: FounderOperatorUseCase[] = [
  {
    name: "investor diligence contradiction",
    task: {
      id: "fo-investor-diligence",
      register: "Diligence",
      prompt: "Investor says yes in email, but data-room comments say approval is still missing.",
    },
    agent: "Analyst",
    wrongAgent: "SDR",
    correction_kind: "outer",
    correctionNote: "Treat the data-room comment as unresolved approval, not a committed yes.",
  },
  {
    name: "customer pilot follow-up",
    task: {
      id: "fo-customer-followup",
      register: "Outreach",
      prompt: "Draft the follow-up after a design-partner call with legal and budget still open.",
    },
    agent: "SDR",
    wrongAgent: "Analyst",
    correction_kind: "cross",
    correctionNote: "Separate the founder promise from the buyer ask; do not imply legal is done.",
  },
  {
    name: "runway tradeoff judgment",
    task: {
      id: "fo-runway-tradeoff",
      register: "Judgment",
      prompt: "Choose between a paid pilot, a grant sprint, or delaying hiring to preserve runway.",
    },
    agent: "Strategist",
    wrongAgent: "Operator",
    correction_kind: "inner",
    correctionNote: "The constraint is preserving learning rate, not minimizing burn at all costs.",
  },
  {
    name: "launch-week operating plan",
    task: {
      id: "fo-launch-plan",
      register: "Operations",
      prompt: "Turn the Berlin demo run-of-show into an owner-by-owner execution plan.",
    },
    agent: "Operator",
    wrongAgent: "Strategist",
    correction_kind: "emergence",
    correctionNote: "Third path: hold the public launch and run a private concierge pilot first.",
  },
];

function makeAgent(config: {
  name: FounderOperatorUseCase["agent"];
  register: Register;
  archetype: string;
  payTo: string;
  price: number;
  hidden_risk: string;
  next_move: string;
}): PricedAgent {
  return {
    name: config.name,
    register: config.register,
    archetype: config.archetype,
    payTo: config.payTo,
    price: config.price,
    asset: "ALGO",
    serve: (task) => ({
      agent_name: config.name,
      archetype: config.archetype,
      situation: `${config.name} read (${task.register}): ${task.prompt}`,
      hidden_risk: config.hidden_risk,
      next_move: config.next_move,
      refusal: null,
      ordinal: 0,
    }),
  };
}

function fixture(): { registry: AgentRegistry; agents: Record<FounderOperatorUseCase["agent"], PricedAgent> } {
  const agents = {
    Analyst: makeAgent({
      name: "Analyst",
      register: "Diligence",
      archetype: "Diligence",
      payTo: "ANALYSTWALLET",
      price: 10_000,
      hidden_risk: "The apparent answer may be a source-of-record mismatch.",
      next_move: "Diff the claim against primary evidence before acting.",
    }),
    SDR: makeAgent({
      name: "SDR",
      register: "Outreach",
      archetype: "Outreach",
      payTo: "SDRWALLET",
      price: 5_000,
      hidden_risk: "A confident message can overclaim unresolved commitments.",
      next_move: "Draft with explicit open loops and one concrete ask.",
    }),
    Strategist: makeAgent({
      name: "Strategist",
      register: "Judgment",
      archetype: "Judgment",
      payTo: "STRATEGISTWALLET",
      price: 15_000,
      hidden_risk: "A clean option ranking can hide the actual constraint.",
      next_move: "Name the governing constraint before choosing a path.",
    }),
    Operator: makeAgent({
      name: "Operator",
      register: "Operations",
      archetype: "Operations",
      payTo: "OPERATORWALLET",
      price: 7_500,
      hidden_risk: "A plan without owners can look complete while staying inert.",
      next_move: "Translate the decision into owners, dates, and stop conditions.",
    }),
  };
  const registry = new AgentRegistry();
  Object.values(agents).forEach((agent) => registry.add(agent));
  return { registry, agents };
}

test("multiple founder/operator use cases settle, anchor, verify, and accept corrections", async () => {
  for (const uc of useCases) {
    const { registry, agents } = fixture();
    const agent = agents[uc.agent];
    const vault = new Vault(clock);
    const anchor = new MockAnchorChain(clock);
    const endpoint = new PricedEndpoint(agent, new MockFacilitator(clock), registry, { vault, anchorChain: anchor, clock });

    const paid = await x402Exchange(endpoint, uc.task, new MockPayer());

    assert.equal(paid.outcome, "paid", uc.name);
    if (paid.outcome !== "paid") continue;
    assert.equal(paid.settlement.success, true, uc.name);
    assert.ok(paid.anchor, uc.name);

    const packetId = `pkt_${uc.task.id}_${agent.name}`;
    const shared = vault.sharePacket(packetId);
    assert.ok(shared, uc.name);
    const verified = await verifyPacket(shared, paid.anchor.anchor_txn_id, anchor);
    assert.equal(verified.ok, true, uc.name);

    const firstHash = signPacket(shared).packet_hash;
    const anchoredEvent = vault.list("packet.anchored").at(-1);
    assert.ok(anchoredEvent, uc.name);
    const correction = recordCorrection(vault, {
      correction_kind: uc.correction_kind,
      target_event_id: anchoredEvent.id,
      user_note: uc.correctionNote,
      provenance: { source: "founder-operator", session: uc.task.id },
    });

    assert.equal(correction.projectable, uc.correction_kind !== "emergence", uc.name);
    const projectedKinds = projectCorrections(vault.list("correction")).map((c) => c.correction_kind);
    assert.deepEqual(projectedKinds, uc.correction_kind === "emergence" ? [] : [uc.correction_kind], uc.name);

    const correctedRead = agent.serve({ ...uc.task, prompt: `${uc.task.prompt} [founder correction: ${uc.correctionNote}]` });
    const correctedPacket: Packet = {
      id: `${packetId}_corrected`,
      context: uc.task.prompt,
      user_correction: uc.correctionNote,
      chosen_agent: agent.name,
      correction_kind: uc.correction_kind,
      runtime_mode: "demo",
      created_at: clock(),
      agent_reads: [correctedRead],
    };
    vault.save(correctedPacket);
    const correctedAnchor = await vault.anchorPacket(correctedPacket.id, anchor);
    const correctedVerify = await verifyPacket(correctedPacket, correctedAnchor.anchor_txn_id, anchor);

    assert.equal(correctedVerify.ok, true, uc.name);
    assert.notEqual(signPacket(correctedPacket).packet_hash, firstHash, uc.name);
    assert.equal(vault.count("agent.call"), 2, uc.name);
    assert.equal(vault.count("packet.saved"), 2, uc.name);
    assert.equal(vault.count("packet.anchored"), 2, uc.name);
    assert.equal(vault.count("correction"), 1, uc.name);
    assert.equal(vault.count("lane.refusal"), 0, uc.name);
  }
});

test("misrouted founder/operator use cases are refused free before settlement", async () => {
  for (const uc of useCases) {
    const { registry, agents } = fixture();
    const wrongAgent = agents[uc.wrongAgent];
    const vault = new Vault(clock);
    const endpoint = new PricedEndpoint(wrongAgent, new MockFacilitator(clock), registry, { vault, clock });

    const refused = await x402Exchange(endpoint, uc.task, new MockPayer());

    assert.equal(refused.outcome, "refused-free", uc.name);
    if (refused.outcome !== "refused-free") continue;
    assert.equal(refused.referTo, uc.agent, uc.name);
    assert.match(refused.refusal, new RegExp(`${wrongAgent.name} refuses`), uc.name);

    const refusalEvent = vault.list("lane.refusal")[0];
    assert.ok(refusalEvent, uc.name);
    const payload = refusalEvent.payload as { agent: string; task_register: string; refer_to: string | null };
    assert.equal(payload.agent, wrongAgent.name, uc.name);
    assert.equal(payload.task_register, uc.task.register, uc.name);
    assert.equal(payload.refer_to, uc.agent, uc.name);
    assert.equal(vault.count("agent.call"), 0, uc.name);
    assert.equal(vault.count("packet.saved"), 0, uc.name);
    assert.equal(vault.count("packet.anchored"), 0, uc.name);
  }
});
