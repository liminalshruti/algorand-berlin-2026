import algosdk from 'algosdk';
import type { Ctx } from './contract.js';
import { DEFAULT_SERVICE_ID, registerAgentLocal, registerServiceLocal } from './agents.js';

// Seeded fallback agents are just receive addresses; card-backed TestNet agents
// provide stable public wallets through docs/agents/testnet/*.json.
type SeedConfig = {
  name: string;
  quote: number;
  challenge_amount?: number;
};

const CONFIGS: SeedConfig[] = [
  {
    name: 'Honest Agent',
    quote: 0.1,
  },
  {
    name: 'Budget Agent',
    quote: 0.07,
  },
  {
    name: 'Cheat Agent',
    quote: 0.04,
    challenge_amount: 0.06,
  },
];

function resolveAddr(): string {
  return algosdk.generateAccount().addr.toString();
}

export function seedAgents(ctx: Ctx): void {
  for (const config of CONFIGS) {
    const addr = resolveAddr();
    const agent = registerAgentLocal(ctx, {
      name: config.name,
      agent_wallet: addr,
      agent_uri: `https://agents.local/${addr}`,
    });

    registerServiceLocal(ctx, {
      service_id: DEFAULT_SERVICE_ID,
      agent_id: agent.id,
      protocol: 'MCP',
      endpoint: `${agent.agent_uri}/mcp`,
      name: 'Diligence report',
      quote: config.quote,
      asset: 'ALGO',
      source: 'seed',
      challenge_amount: config.challenge_amount,
    });
  }
}

// Fund each agent with 0.5 ALGO so they meet Algorand's min balance requirement.
// Must be called before any payments are made.
export async function fundAgents(ctx: Ctx): Promise<void> {
  for (const agent of ctx.agents.values()) {
    await ctx.deps.settle(agent.agent_wallet, 0.5, { schema: 'fund', agent_id: agent.id });
    console.log(`  funded ${agent.name}: ${agent.agent_wallet}`);
  }
}
