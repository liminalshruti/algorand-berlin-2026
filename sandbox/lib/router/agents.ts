// Reza's lane — demo identity discovery and routing helpers.
import algosdk from 'algosdk';
import { v4 as uuidv4 } from 'uuid';
import type { ActiveQuote, Agent, AgentService, Ctx, PaymentRequirement, RouteOption } from './contract.js';

const DEFAULT_SERVICE_ID = 'diligence.report';
const DEFAULT_REPUTATION = 50;

type RegistryCtx = Pick<Ctx, 'net' | 'agents' | 'services' | 'activeQuotes' | 'paymentRequirements'>;

export type AgentRegistration = Omit<Agent, 'id'> & {
  id?: string;
};

export type ServiceRegistration = AgentService & {
  quote: number;
  asset?: string;
  challenge_amount?: number;
  challenge_pay_to?: string;
};

export type AgentRow = {
  agent_id: string;
  registry_agent_id?: string;
  name: string;
  agent_uri: string;
  agent_wallet: string;
  services: AgentService[];
};

export type RoutedCandidate = {
  agent: Agent;
  service: AgentService;
  quote: ActiveQuote;
  paymentRequirement: PaymentRequirement;
  reputation: number;
};

type QuoteTemplate = {
  agent_id: string;
  service_id: string;
  amount: number;
  asset: string;
  pay_to: string;
  challenge_amount?: number;
  challenge_pay_to?: string;
};

const quoteTemplates = new Map<string, QuoteTemplate>();

const serviceKey = (agent_id: string, service_id: string): string => `${agent_id}::${service_id}`;

export function agentId(net: string, address: string): string {
  const trimmed = address.trim();
  return `algorand:${net}:${trimmed}`;
}

export function registerAgentLocal(ctx: RegistryCtx, input: AgentRegistration): Agent {
  const agent_wallet = input.agent_wallet.trim();
  if (!algosdk.isValidAddress(agent_wallet)) {
    throw Object.assign(new Error(`Invalid Algorand agent wallet: ${agent_wallet}`), { status: 400 });
  }

  const agent: Agent = {
    id: input.id ?? agentId(ctx.net, agent_wallet),
    name: input.name.trim(),
    agent_uri: input.agent_uri.trim(),
    agent_wallet,
  };

  if (!agent.name) {
    throw Object.assign(new Error('name is required'), { status: 400 });
  }
  if (!agent.agent_uri) {
    throw Object.assign(new Error('agent_uri is required'), { status: 400 });
  }

  if (ctx.agents.has(agent.id)) {
    throw Object.assign(new Error(`Duplicate agent id: ${agent.id}`), { status: 409 });
  }

  ctx.agents.set(agent.id, agent);
  return agent;
}

export function registerServiceLocal(ctx: RegistryCtx, input: ServiceRegistration): AgentService {
  if (!ctx.agents.has(input.agent_id)) {
    throw Object.assign(new Error(`Unknown agent: ${input.agent_id}`), { status: 400 });
  }

  const service: AgentService = {
    service_id: input.service_id.trim(),
    agent_id: input.agent_id,
    protocol: input.protocol,
    endpoint: input.endpoint.trim(),
    name: input.name.trim(),
  };

  if (!service.service_id || !service.endpoint || !service.name) {
    throw Object.assign(new Error('service_id, endpoint, and name are required'), { status: 400 });
  }

  const existing = ctx.services.find((s) => s.agent_id === service.agent_id && s.service_id === service.service_id);
  if (existing) {
    throw Object.assign(new Error(`Duplicate agent service: ${serviceKey(service.agent_id, service.service_id)}`), { status: 409 });
  }

  ctx.services.push(service);
  const agent = ctx.agents.get(service.agent_id)!;
  quoteTemplates.set(serviceKey(service.agent_id, service.service_id), {
    agent_id: service.agent_id,
    service_id: service.service_id,
    amount: input.quote,
    asset: input.asset ?? 'ALGO',
    pay_to: agent.agent_wallet,
    challenge_amount: input.challenge_amount,
    challenge_pay_to: input.challenge_pay_to,
  });
  return service;
}

export function discoverServices(ctx: Pick<Ctx, 'services'>, service_id = DEFAULT_SERVICE_ID): AgentService[] {
  return ctx.services.filter((service) => service.service_id === service_id);
}

export function agentRow(agent: Agent, services: AgentService[], registry_agent_id?: string): AgentRow {
  return {
    agent_id: agent.id,
    ...(registry_agent_id ? { registry_agent_id } : {}),
    name: agent.name,
    agent_uri: agent.agent_uri,
    agent_wallet: agent.agent_wallet,
    services,
  };
}

export function candidateFor(
  ctx: RegistryCtx,
  agent: Agent,
  service: AgentService,
  reputation: number,
): RoutedCandidate {
  const template = quoteTemplates.get(serviceKey(agent.id, service.service_id));
  if (!template) {
    throw Object.assign(new Error(`Missing quote template: ${serviceKey(agent.id, service.service_id)}`), { status: 500 });
  }

  const quote: ActiveQuote = {
    quote_id: uuidv4(),
    agent_id: agent.id,
    service_id: service.service_id,
    amount: template.amount,
    asset: template.asset,
    pay_to: template.pay_to,
  };
  const paymentRequirement: PaymentRequirement = {
    quote_id: quote.quote_id,
    amount: template.challenge_amount ?? template.amount,
    asset: template.asset,
    pay_to: template.challenge_pay_to ?? template.pay_to,
  };

  ctx.activeQuotes.set(quote.quote_id, quote);
  ctx.paymentRequirements.set(quote.quote_id, paymentRequirement);
  return { agent, service, quote, paymentRequirement, reputation };
}

export function discoveryOptions(candidates: RoutedCandidate[]): RouteOption[] {
  const prices = candidates.map((candidate) => candidate.quote.amount);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const priceScore = (price: number): number => (max === min ? 100 : ((max - price) / (max - min)) * 100);

  return candidates
    .map((candidate, index) => {
      const trust_score = Math.round(
        (priceScore(candidate.quote.amount) * 0.4) + (candidate.reputation * 0.6),
      );
      return {
        option_id: `${candidate.quote.quote_id}:opt-${index + 1}`,
        agent_id: candidate.agent.id,
        service_id: candidate.service.service_id,
        quote_id: candidate.quote.quote_id,
        name: candidate.agent.name,
        price: candidate.quote.amount,
        asset: candidate.quote.asset,
        pay_to: candidate.quote.pay_to,
        reputation: candidate.reputation,
        trust_score,
      };
    })
    .sort((a, b) => b.trust_score - a.trust_score);
}

export { DEFAULT_REPUTATION, DEFAULT_SERVICE_ID };
