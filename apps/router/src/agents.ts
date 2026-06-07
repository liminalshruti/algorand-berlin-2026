// Reza's lane — demo identity discovery and routing helpers.
import algosdk from 'algosdk';
import { v4 as uuidv4 } from 'uuid';
import type { ActiveQuote, Agent, AgentService, Ctx, PaymentRequirement, Reputation, RouteOption } from './contract.js';

const DEFAULT_SERVICE_ID = 'diligence.report';
const DEFAULT_REPUTATION = 50;
const DEFAULT_PROXY_NAME = 'Diligence report';
const DEFAULT_PROXY_DESCRIPTION = 'Compare contradictory business signals and produce a concise diligence read.';
const ARC8004_REGISTRATION_TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
const QUOTE_TTL_MS = 5 * 60 * 1000;

export const TESTNET_CARD_MANIFEST_URL =
  'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/manifest.json';
export const TESTNET_CARD_URLS = [
  'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/honest-agent.json',
  'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/cheat-agent.json',
] as const;

const HONEST_AGENT_WALLET = 'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY';
const CHEAT_AGENT_WALLET = '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ';
const demoAgentQuotes = new Map<string, { amount: number; challenge_amount?: number; challenge_pay_to?: string }>([
  [HONEST_AGENT_WALLET, { amount: 0.1 }],
  [CHEAT_AGENT_WALLET, { amount: 0.04, challenge_amount: 0.06 }],
]);

type RegistryCtx = Pick<Ctx, 'net' | 'agents' | 'services' | 'activeQuotes' | 'paymentRequirements'>;
type CatalogCtx = Pick<Ctx, 'net' | 'agents' | 'services' | 'repState'>;

export type AgentRegistration = Omit<Agent, 'id'> & {
  id?: string;
};

export type ServiceRegistration = AgentService & {
  quote?: number;
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

export type NormalizedAgentCard = {
  type: typeof ARC8004_REGISTRATION_TYPE;
  name: string;
  description: string;
  agent_uri: string;
  agent_wallet: string;
  mcp_endpoint: string;
  x402Support: true;
  active: true;
  registrations: unknown[];
  supportedTrust: string[];
};

export type CardManifest = {
  cards: Array<{
    name: string;
    agent_uri: string;
  }>;
};

export type AgentCardIngestionResult = {
  status: 'loaded' | 'failed' | 'skipped';
  cards: NormalizedAgentCard[];
  error?: string;
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

type FetchJson = (url: string) => Promise<unknown>;

const quoteTemplates = new Map<string, QuoteTemplate>();

const serviceKey = (agent_id: string, service_id: string): string => `${agent_id}::${service_id}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validationError(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) validationError(`${key} is required`);
  return value.trim();
}

function optionalString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function assertHttpUrl(value: string, label: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') validationError(`${label} must be an HTTP URL`);
  } catch {
    validationError(`${label} must be an HTTP URL`);
  }
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) validationError(`${key} must be an array`);
  return value;
}

function reputationFor(rep: Reputation | null): Reputation {
  return rep ?? { score: DEFAULT_REPUTATION, reads_logged: 0, corrections_logged: 0 };
}

async function fetchJsonFromUrl(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<unknown>;
}

export function agentId(net: string, address: string): string {
  const trimmed = address.trim();
  return `algorand:${net}:${trimmed}`;
}

export function parseAgentCard(raw: unknown, agent_uri: string): NormalizedAgentCard {
  assertHttpUrl(agent_uri, 'agent_uri');
  if (!isRecord(raw)) validationError('agent card must be an object');

  const type = requiredString(raw, 'type');
  if (type !== ARC8004_REGISTRATION_TYPE) {
    validationError(`unsupported registration type: ${type}`);
  }

  if (raw.active !== true) validationError('agent card must be active');
  if (raw.x402Support !== true) validationError('agent card must set x402Support: true');

  const name = requiredString(raw, 'name');
  const description = optionalString(raw, 'description');
  const services = readArray(raw, 'services');

  const mcpService = services.find((service) => {
    return isRecord(service) && service.name === 'MCP' && typeof service.endpoint === 'string';
  });
  if (!isRecord(mcpService)) validationError('services[] must include MCP');
  const mcp_endpoint = requiredString(mcpService, 'endpoint');
  assertHttpUrl(mcp_endpoint, 'MCP endpoint');

  const walletService = services.find((service) => {
    return isRecord(service) && service.name === 'algorand-wallet' && typeof service.endpoint === 'string';
  });
  if (!isRecord(walletService)) validationError('services[] must include algorand-wallet');
  const agent_wallet = requiredString(walletService, 'endpoint');
  if (!algosdk.isValidAddress(agent_wallet)) {
    validationError(`Invalid Algorand agent wallet: ${agent_wallet}`);
  }

  return {
    type: ARC8004_REGISTRATION_TYPE,
    name,
    description,
    agent_uri,
    agent_wallet,
    mcp_endpoint,
    x402Support: true,
    active: true,
    registrations: Array.isArray(raw.registrations) ? raw.registrations : [],
    supportedTrust: Array.isArray(raw.supportedTrust)
      ? raw.supportedTrust.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function parseCardManifest(raw: unknown): CardManifest {
  if (!isRecord(raw)) validationError('card manifest must be an object');
  const cards = readArray(raw, 'cards').map((entry) => {
    if (!isRecord(entry)) validationError('manifest card entry must be an object');
    const name = requiredString(entry, 'name');
    const agent_uri = requiredString(entry, 'agent_uri');
    assertHttpUrl(agent_uri, 'manifest agent_uri');
    return { name, agent_uri };
  });
  if (cards.length === 0) validationError('manifest must list at least one card');
  return { cards };
}

export async function resolveAgentCard(agent_uri: string, fetchJson: FetchJson = fetchJsonFromUrl): Promise<NormalizedAgentCard> {
  const raw = await fetchJson(agent_uri);
  return parseAgentCard(raw, agent_uri);
}

export async function resolveCardsFromManifest(
  manifest_uri: string,
  fetchJson: FetchJson = fetchJsonFromUrl,
): Promise<NormalizedAgentCard[]> {
  const manifest = parseCardManifest(await fetchJson(manifest_uri));
  return Promise.all(manifest.cards.map((card) => resolveAgentCard(card.agent_uri, fetchJson)));
}

export async function resolveDefaultTestnetCards(fetchJson: FetchJson = fetchJsonFromUrl): Promise<NormalizedAgentCard[]> {
  try {
    return await resolveCardsFromManifest(TESTNET_CARD_MANIFEST_URL, fetchJson);
  } catch {
    return Promise.all(TESTNET_CARD_URLS.map((agent_uri) => resolveAgentCard(agent_uri, fetchJson)));
  }
}

function removeServices(ctx: RegistryCtx, shouldRemove: (service: AgentService) => boolean): void {
  const removedAgentIds = new Set<string>();
  ctx.services = ctx.services.filter((service) => {
    if (!shouldRemove(service)) return true;
    quoteTemplates.delete(serviceKey(service.agent_id, service.service_id));
    removedAgentIds.add(service.agent_id);
    return false;
  });

  for (const agent_id of removedAgentIds) {
    if (!ctx.services.some((service) => service.agent_id === agent_id)) ctx.agents.delete(agent_id);
  }
}

export function replaceServiceWithCardBackedAgents(ctx: RegistryCtx, cards: NormalizedAgentCard[]): Agent[] {
  const cardServiceIds = new Set([DEFAULT_SERVICE_ID]);
  removeServices(ctx, (service) => cardServiceIds.has(service.service_id) && service.source !== 'agent_uri');

  for (const card of cards) {
    const id = agentId(ctx.net, card.agent_wallet);
    removeServices(ctx, (service) => service.agent_id === id && cardServiceIds.has(service.service_id));
    if (!ctx.services.some((service) => service.agent_id === id)) ctx.agents.delete(id);
  }

  return cards.map((card) => ingestAgentCard(ctx, card));
}

export async function ingestAgentCardsFromManifest(
  ctx: RegistryCtx,
  options: {
    manifest_uri?: string;
    fetchJson?: FetchJson;
    enabled?: boolean;
    warn?: (message: string) => void;
  } = {},
): Promise<AgentCardIngestionResult> {
  if (options.enabled === false) return { status: 'skipped', cards: [] };

  const fetchJson = options.fetchJson ?? fetchJsonFromUrl;

  try {
    const cards = options.manifest_uri
      ? await resolveCardsFromManifest(options.manifest_uri, fetchJson)
      : await resolveDefaultTestnetCards(fetchJson);
    replaceServiceWithCardBackedAgents(ctx, cards);
    return { status: 'loaded', cards };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.warn?.(`agent card ingestion skipped: ${message}`);
    return { status: 'failed', cards: [], error: message };
  }
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
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.source ? { source: input.source } : {}),
  };

  if (!service.service_id || !service.endpoint || !service.name) {
    throw Object.assign(new Error('service_id, endpoint, and name are required'), { status: 400 });
  }
  if (input.quote !== undefined && (!Number.isFinite(input.quote) || input.quote <= 0)) {
    throw Object.assign(new Error('quote must be a positive number'), { status: 400 });
  }

  const existing = ctx.services.find((s) => s.agent_id === service.agent_id && s.service_id === service.service_id);
  if (existing) {
    throw Object.assign(new Error(`Duplicate agent service: ${serviceKey(service.agent_id, service.service_id)}`), { status: 409 });
  }

  ctx.services.push(service);
  if (input.quote !== undefined) {
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
  }
  return service;
}

export function ingestAgentCard(ctx: RegistryCtx, card: NormalizedAgentCard): Agent {
  const agent = registerAgentLocal(ctx, {
    id: agentId(ctx.net, card.agent_wallet),
    name: card.name,
    agent_uri: card.agent_uri,
    agent_wallet: card.agent_wallet,
  });

  registerServiceLocal(ctx, {
    service_id: DEFAULT_SERVICE_ID,
    agent_id: agent.id,
    protocol: 'MCP',
    endpoint: card.mcp_endpoint,
    name: DEFAULT_PROXY_NAME,
    description: DEFAULT_PROXY_DESCRIPTION,
    source: 'agent_uri',
  });

  return agent;
}

export function discoverServices(ctx: Pick<Ctx, 'services'>, service_id = DEFAULT_SERVICE_ID): AgentService[] {
  const services = ctx.services.filter((service) => service.service_id === service_id);
  const cardBacked = services.filter((service) => service.source === 'agent_uri');
  return cardBacked.length > 0 ? cardBacked : services;
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

function quoteForService(agent: Agent, service: AgentService): QuoteTemplate | null {
  const template = quoteTemplates.get(serviceKey(agent.id, service.service_id));
  if (template) return template;

  if (service.source !== 'agent_uri' || service.service_id !== DEFAULT_SERVICE_ID) return null;

  const demoQuote = demoAgentQuotes.get(agent.agent_wallet) ?? { amount: 0.1 };
  return {
    agent_id: agent.id,
    service_id: service.service_id,
    amount: demoQuote.amount,
    asset: 'ALGO',
    pay_to: agent.agent_wallet,
    challenge_amount: demoQuote.challenge_amount,
    challenge_pay_to: demoQuote.challenge_pay_to,
  };
}

export function candidateFor(
  ctx: RegistryCtx,
  agent: Agent,
  service: AgentService,
  reputation: number,
): RoutedCandidate {
  const template = quoteForService(agent, service);
  if (!template) {
    throw Object.assign(new Error(`Missing quote template: ${serviceKey(agent.id, service.service_id)}`), { status: 500 });
  }

  const observedAt = new Date();
  const quote: ActiveQuote = {
    quote_id: uuidv4(),
    agent_id: agent.id,
    service_id: service.service_id,
    amount: template.amount,
    asset: template.asset,
    pay_to: template.pay_to,
    observed_at: observedAt.toISOString(),
    expires_at: new Date(observedAt.getTime() + QUOTE_TTL_MS).toISOString(),
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

export function buildServicesCatalog(
  ctx: CatalogCtx,
  registryAgentIdFor: (agent_id: string) => string | null = () => null,
): {
  network: string;
  generated_at: string;
  services: Array<{
    service_id: string;
    name: string;
    description: string;
    proxy: {
      route_endpoint: 'POST /api/route';
      route_body: {
        service_id: string;
        task: 'string';
      };
    };
    options: Array<{
      option_key: string;
      agent_id: string;
      registry_agent_id?: string;
      agent: {
        name: string;
        agent_uri: string;
        agent_wallet: string;
      };
      capability: {
        source: AgentService['source'];
        protocol: AgentService['protocol'];
        endpoint: string;
        name: string;
        description: string;
      };
      quote: {
        amount: number;
        asset: string;
        pay_to: string;
      };
      trust: {
        reputation: number;
        reads_logged: number;
        corrections_logged: number;
      };
    }>;
  }>;
} {
  const serviceIds = [...new Set(ctx.services.map((service) => service.service_id))].sort();
  const services = serviceIds.flatMap((service_id) => {
    const groupServices = discoverServices(ctx, service_id);
    if (groupServices.length === 0) return [];

    const first = groupServices[0];
    const options = groupServices.flatMap((service) => {
      const agent = ctx.agents.get(service.agent_id);
      const template = agent ? quoteForService(agent, service) : null;
      if (!agent || !template) return [];

      const rep = reputationFor(ctx.repState.getReputation(agent.id));
      const registry_agent_id = registryAgentIdFor(agent.id);

      return [{
        option_key: serviceKey(agent.id, service.service_id),
        agent_id: agent.id,
        ...(registry_agent_id ? { registry_agent_id } : {}),
        agent: {
          name: agent.name,
          agent_uri: agent.agent_uri,
          agent_wallet: agent.agent_wallet,
        },
        capability: {
          source: service.source,
          protocol: service.protocol,
          endpoint: service.endpoint,
          name: service.name,
          description: service.description ?? '',
        },
        quote: {
          amount: template.amount,
          asset: template.asset,
          pay_to: template.pay_to,
        },
        trust: {
          reputation: rep.score,
          reads_logged: rep.reads_logged,
          corrections_logged: rep.corrections_logged,
        },
      }];
    }).sort((a, b) => a.agent.name.localeCompare(b.agent.name));

    if (options.length === 0) return [];

    return [{
      service_id,
      name: first.name,
      description: first.description ?? '',
      proxy: {
        route_endpoint: 'POST /api/route' as const,
        route_body: {
          service_id,
          task: 'string' as const,
        },
      },
      options,
    }];
  });

  return {
    network: ctx.net,
    generated_at: new Date().toISOString(),
    services,
  };
}

export { DEFAULT_REPUTATION, DEFAULT_SERVICE_ID };
