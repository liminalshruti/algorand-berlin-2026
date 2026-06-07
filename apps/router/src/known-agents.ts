import type { Agent, Ctx } from './contract.js';

export const KNOWN_TESTNET_AGENTS = [
  {
    name: 'Honest Agent',
    agent_uri:
      'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/honest-agent.json',
    agent_wallet: 'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY',
    local_card_path: 'docs/agents/testnet/honest-agent.json',
  },
  {
    name: 'Cheat Agent',
    agent_uri:
      'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/cheat-agent.json',
    agent_wallet: '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ',
    local_card_path: 'docs/agents/testnet/cheat-agent.json',
  },
] as const;

export type KnownTestnetAgent = (typeof KNOWN_TESTNET_AGENTS)[number];

export type KnownAgentRegistrationTarget = {
  agent_id: string;
  name: KnownTestnetAgent['name'];
  agent_uri: KnownTestnetAgent['agent_uri'];
  agent_wallet: KnownTestnetAgent['agent_wallet'];
};

const knownAgentIndex = new Map<string, number>(
  KNOWN_TESTNET_AGENTS.map((agent, index) => [agent.agent_uri, index]),
);

export function knownTestnetAgentFor(agent: Pick<Agent, 'agent_uri' | 'agent_wallet'>): KnownTestnetAgent | null {
  return KNOWN_TESTNET_AGENTS.find((known) => {
    return known.agent_uri === agent.agent_uri && known.agent_wallet === agent.agent_wallet;
  }) ?? null;
}

export function knownAgentRegistrationTargets(ctx: Pick<Ctx, 'agents'>): KnownAgentRegistrationTarget[] {
  return [...ctx.agents.values()]
    .flatMap((agent) => {
      const known = knownTestnetAgentFor(agent);
      if (!known) return [];
      return [{
        agent_id: agent.id,
        name: known.name,
        agent_uri: known.agent_uri,
        agent_wallet: known.agent_wallet,
      }];
    })
    .sort((a, b) => {
      return (knownAgentIndex.get(a.agent_uri) ?? 0) - (knownAgentIndex.get(b.agent_uri) ?? 0);
    });
}
