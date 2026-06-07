import algosdk from 'algosdk';
import type { AccountBalance, Agent, Ctx } from './contract.js';
import { DEFAULT_SERVICE_ID, registerAgentLocal, registerServiceLocal } from './agents.js';

// Seeded fallback agents are just receive addresses; card-backed TestNet agents
// provide stable public wallets through docs/agents/testnet/*.json.
type SeedConfig = {
  name: string;
  quote: number;
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
  },
];

const DEFAULT_AGENT_FUND_ALGO = 0.5;
const DEFAULT_MIN_AVAILABLE_ALGO = 0.1;

export type FundAgentAction = 'skipped' | 'funded' | 'required';

export type FundAgentResult = {
  action: FundAgentAction;
  agent_id: string;
  name: string;
  agent_wallet: string;
  balance: AccountBalance | null;
  fund_amount: number;
  min_available: number;
};

export type FundAgentsOptions = {
  lowSpendSmoke?: boolean;
  fundAmountAlgo?: number;
  minAvailableAlgo?: number;
  log?: (message: string) => void;
};

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
    });
  }
}

function shouldSkipFunding(balance: AccountBalance | null, minAvailableAlgo: number): boolean {
  return balance !== null && balance.available >= minAvailableAlgo;
}

function describeBalance(balance: AccountBalance | null): string {
  if (!balance) return 'balance=unknown';
  return [
    `balance=${balance.amount.toFixed(6)} ALGO`,
    `available=${balance.available.toFixed(6)} ALGO`,
    `min=${balance.min_balance.toFixed(6)} ALGO`,
  ].join(' ');
}

async function accountBalance(ctx: Ctx, agent: Agent): Promise<AccountBalance | null> {
  return ctx.deps.accountBalance ? ctx.deps.accountBalance(agent.agent_wallet) : null;
}

// Idempotently fund agents for the demo. Low-spend smoke mode refuses to top up
// wallets so an intended sub-0.1 ALGO proof run cannot accidentally spend 0.5+.
export async function fundAgents(ctx: Ctx, options: FundAgentsOptions = {}): Promise<FundAgentResult[]> {
  const lowSpendSmoke = options.lowSpendSmoke ?? process.env.LOW_SPEND_SMOKE === 'true';
  const fundAmountAlgo = options.fundAmountAlgo ?? Number(process.env.AGENT_FUND_ALGO ?? DEFAULT_AGENT_FUND_ALGO);
  const minAvailableAlgo = options.minAvailableAlgo ?? Number(
    process.env.AGENT_MIN_AVAILABLE_ALGO ?? DEFAULT_MIN_AVAILABLE_ALGO,
  );
  const log = options.log ?? console.log;
  const results: FundAgentResult[] = [];

  for (const agent of ctx.agents.values()) {
    const balance = await accountBalance(ctx, agent);
    const base = {
      agent_id: agent.id,
      name: agent.name,
      agent_wallet: agent.agent_wallet,
      balance,
      fund_amount: fundAmountAlgo,
      min_available: minAvailableAlgo,
    };

    if (shouldSkipFunding(balance, minAvailableAlgo)) {
      log(`  funding skipped ${agent.name}: ${agent.agent_wallet} ${describeBalance(balance)}`);
      results.push({ ...base, action: 'skipped' });
      continue;
    }

    if (lowSpendSmoke) {
      const message =
        `abort low-spend smoke: funding required for ${agent.name} ${agent.agent_wallet} ` +
        `(${describeBalance(balance)}, min_available=${minAvailableAlgo} ALGO)`;
      log(`  ${message}`);
      results.push({ ...base, action: 'required' });
      throw Object.assign(new Error(message), { status: 402, funding: results });
    }

    log(
      `  funding required ${agent.name}: ${agent.agent_wallet} ` +
      `(${describeBalance(balance)}, min_available=${minAvailableAlgo} ALGO)`,
    );
    await ctx.deps.settle(agent.agent_wallet, fundAmountAlgo, { schema: 'fund', agent_id: agent.id });
    log(`  funded ${agent.name}: ${agent.agent_wallet}`);
    results.push({ ...base, action: 'funded' });
  }

  return results;
}
