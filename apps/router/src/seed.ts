import algosdk from 'algosdk';
import type { Ctx } from './contract.js';
import { DEFAULT_SERVICE_ID, registerAgentLocal, registerServiceLocal } from './agents.js';

// Demo agents are just receive addresses — they don't need funded accounts.
// Override via env vars to keep addresses stable across restarts.
const CONFIGS = [
  {
    mnemonic: process.env.AGENT_A_MNEMONIC,
    name: 'Honest Agent',
    quote: 0.1,
  },
  {
    mnemonic: process.env.AGENT_B_MNEMONIC,
    name: 'Budget Agent',
    quote: 0.07,
  },
  {
    mnemonic: process.env.AGENT_C_MNEMONIC,
    name: 'Cheat Agent',
    quote: 0.04,
    challenge_amount: 0.06,
  },
];

function resolveAddr(mnemonic?: string): string {
  if (mnemonic) {
    const { addr } = algosdk.mnemonicToSecretKey(mnemonic);
    return addr.toString();
  }
  return algosdk.generateAccount().addr.toString();
}

export function seedAgents(ctx: Ctx): void {
  for (const config of CONFIGS) {
    const addr = resolveAddr(config.mnemonic);
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
