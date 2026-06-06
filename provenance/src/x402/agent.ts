// Priced bounded agents + structural lane guard (Sean lane · Berlin AlgoHack).
//
// Mirrors the liminal-agents model: twelve specialists across four registers, each with a domain
// it engages and an anti-domain it refuses — "refusal is the feature." Here each agent also has a
// price and a wallet. The lane check is the commerce guard: an agent serves (and charges) only for
// work in its register; out-of-lane work is refused for free, naming the correct agent. That
// refusal is exactly what keeps an agent from charging for work it has no business doing.

import { type AgentRead } from "../packet.ts";
import { type Asset } from "./types.ts";

export type Register = "Diligence" | "Outreach" | "Judgment" | "Operations";

export interface Task {
  id: string;
  /** The register the task belongs to — used by the lane guard. */
  register: Register;
  prompt: string;
}

export interface PricedAgent {
  name: string;
  register: Register;
  archetype: string;
  /** Wallet that receives settlement for in-lane work. */
  payTo: string;
  /** Price of one read, in the asset's smallest unit (microAlgos for ALGO). */
  price: number;
  asset: Asset;
  /** Bounded work: produce a read for a task IN this agent's lane. */
  serve(task: Task): AgentRead;
}

export interface LaneCheck {
  inLane: boolean;
  /** When out of lane, the name of the agent that should handle it (refusal-as-output). */
  referTo: string | null;
}

export class AgentRegistry {
  private readonly byName = new Map<string, PricedAgent>();

  add(agent: PricedAgent): this {
    this.byName.set(agent.name, agent);
    return this;
  }

  get(name: string): PricedAgent | null {
    return this.byName.get(name) ?? null;
  }

  all(): PricedAgent[] {
    return [...this.byName.values()];
  }

  /** Name the first agent whose register matches — the one a refusal should point to. */
  referFor(register: Register): string | null {
    for (const a of this.byName.values()) if (a.register === register) return a.name;
    return null;
  }
}

/** The structural guard: is this task in the agent's lane, and if not, who should take it? */
export function checkLane(agent: PricedAgent, task: Task, registry: AgentRegistry): LaneCheck {
  if (agent.register === task.register) return { inLane: true, referTo: null };
  return { inLane: false, referTo: registry.referFor(task.register) };
}
