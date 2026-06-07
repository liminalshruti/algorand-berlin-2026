// Reza's lane — demo identity discovery and routing helpers.
import algosdk from 'algosdk';
import { v4 as uuidv4 } from 'uuid';
import type { ActiveQuote, Agent, AgentService, Ctx, PaymentRequirement, QuoteSnapshot, Reputation, RouteOption } from './contract.js';

const DEFAULT_SERVICE_ID = 'diligence.report';
const DEFAULT_REPUTATION = 50;
const DEFAULT_PROXY_NAME = 'Diligence report';
const DEFAULT_PROXY_DESCRIPTION = 'Compare contradictory business signals and produce a concise diligence read.';
const ARC8004_REGISTRATION_TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
const QUOTE_TTL_MS = 5 * 60 * 1000;
const MICROALGO = 1_000_000;
const DEFAULT_LOCAL_X402_AGENT_BASE_URL = 'http://localhost:4021';

export const TESTNET_CARD_MANIFEST_URL =
  'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/manifest.json';
export const TESTNET_CARD_URLS = [
  'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/honest-agent.json',
  'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/cheat-agent.json',
] as const;

const HONEST_AGENT_WALLET = 'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY';
const CHEAT_AGENT_WALLET = '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ';
const localDemoMcpPaths = new Map<string, string>([
  [HONEST_AGENT_WALLET, '/honest/mcp'],
  [CHEAT_AGENT_WALLET, '/cheat/mcp'],
]);

type RegistryCtx = Pick<Ctx, 'net' | 'agents' | 'services' | 'quoteCache' | 'activeQuotes' | 'paymentRequirements'>;
type QuoteCtx = Pick<Ctx, 'net' | 'agents' | 'services' | 'quoteCache'>;
type CatalogCtx = Pick<Ctx, 'net' | 'agents' | 'services' | 'quoteCache' | 'repState'>;

export type AgentRegistration = Omit<Agent, 'id'> & {
  id?: string;
};

export type ServiceRegistration = AgentService & {
  quote?: number;
  asset?: string;
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
  quote: QuoteSnapshot;
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
};

type X402ChallengeMode = 'quote' | 'execute';

type X402Requirement = Omit<PaymentRequirement, 'quote_id'>;

type X402FetchRequest = {
  mode: X402ChallengeMode;
  agent_id: string;
  service_id: string;
  network: string;
  task?: string;
  quote_id?: string;
  option_id?: string;
};

export type X402RequirementFetcher = (
  service: AgentService,
  request: X402FetchRequest,
) => Promise<X402Requirement>;

export type QuoteRefreshResult = {
  snapshots: QuoteSnapshot[];
  errors: Array<{
    agent_id: string;
    service_id: string;
    error: string;
  }>;
};

type FetchJson = (url: string) => Promise<unknown>;

const quoteTemplates = new Map<string, QuoteTemplate>();

const serviceKey = (agent_id: string, service_id: string): string => `${agent_id}::${service_id}`;

export const quoteCacheKey = serviceKey;

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

function localX402AgentBaseUrl(): string | null {
  const configured = process.env.LOCAL_X402_AGENT_BASE_URL?.trim();
  if (configured === 'off' || configured === 'card') return null;
  return configured || DEFAULT_LOCAL_X402_AGENT_BASE_URL;
}

function localDemoMcpEndpoint(agent_wallet: string): string | null {
  const path = localDemoMcpPaths.get(agent_wallet);
  const baseUrl = localX402AgentBaseUrl();
  if (!path || !baseUrl) return null;
  return new URL(path, baseUrl).toString();
}

function firstX402Requirement(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) validationError('x402 response must be an object');
  const accepts = raw.accepts;
  if (Array.isArray(accepts) && accepts.length > 0 && isRecord(accepts[0])) return accepts[0];
  const paymentRequirements = raw.paymentRequirements ?? raw.payment_requirements;
  if (isRecord(paymentRequirements)) return paymentRequirements;
  return raw;
}

function readPositiveAmount(record: Record<string, unknown>): number {
  const amount = record.amount;
  if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) return amount;
  if (typeof amount === 'string' && amount.trim()) {
    const parsed = Number(amount);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const maxAmountRequired = record.maxAmountRequired ?? record.max_amount_required;
  if (typeof maxAmountRequired === 'string' && maxAmountRequired.trim()) {
    const microAlgos = Number(maxAmountRequired);
    if (Number.isFinite(microAlgos) && microAlgos > 0) return microAlgos / MICROALGO;
  }
  if (typeof maxAmountRequired === 'number' && Number.isFinite(maxAmountRequired) && maxAmountRequired > 0) {
    return maxAmountRequired / MICROALGO;
  }

  validationError('x402 payment requirement amount is required');
}

function optionalRequirementString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export function paymentRequirementFromX402Response(raw: unknown): X402Requirement {
  const requirement = firstX402Requirement(raw);
  const pay_to = optionalRequirementString(requirement, 'payTo', 'pay_to');
  if (!pay_to) validationError('x402 payment requirement payTo is required');
  if (!algosdk.isValidAddress(pay_to)) validationError(`Invalid x402 payTo address: ${pay_to}`);

  const asset = optionalRequirementString(requirement, 'asset', 'assetId') ?? 'ALGO';
  const parsed: X402Requirement = {
    amount: readPositiveAmount(requirement),
    asset,
    pay_to,
  };

  const network = optionalRequirementString(requirement, 'network');
  const resource = optionalRequirementString(requirement, 'resource');
  const nonce = optionalRequirementString(requirement, 'nonce');
  const expires_at = optionalRequirementString(requirement, 'expiresAt', 'expires_at');

  return {
    ...parsed,
    ...(network ? { network } : {}),
    ...(resource ? { resource } : {}),
    ...(nonce ? { nonce } : {}),
    ...(expires_at ? { expires_at } : {}),
  };
}

export async function fetchPaymentRequirementFromService(
  service: AgentService,
  request: X402FetchRequest,
): Promise<X402Requirement> {
  const res = await fetch(service.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const raw = await res.json().catch(() => ({}));
  if (res.status !== 402) {
    throw Object.assign(new Error(`Expected 402 from ${service.endpoint}; got ${res.status}`), { status: 502 });
  }
  return paymentRequirementFromX402Response(raw);
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
    endpoint: localDemoMcpEndpoint(card.agent_wallet) ?? card.mcp_endpoint,
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

function staticQuoteForService(agent: Agent, service: AgentService): X402Requirement | null {
  const template = quoteTemplates.get(serviceKey(agent.id, service.service_id));
  if (!template) return null;
  return {
    amount: template.amount,
    asset: template.asset,
    pay_to: template.pay_to,
  };
}

async function requirementForService(
  ctx: Pick<Ctx, 'net'>,
  agent: Agent,
  service: AgentService,
  mode: X402ChallengeMode,
  options: {
    task?: string;
    quote_id?: string;
    option_id?: string;
    fetchPaymentRequirement?: X402RequirementFetcher;
  } = {},
): Promise<X402Requirement> {
  const staticQuote = staticQuoteForService(agent, service);
  if (service.source !== 'agent_uri') {
    if (staticQuote) return staticQuote;
    throw Object.assign(new Error(`Missing quote template: ${serviceKey(agent.id, service.service_id)}`), { status: 500 });
  }

  const fetchPaymentRequirement = options.fetchPaymentRequirement ?? fetchPaymentRequirementFromService;
  return fetchPaymentRequirement(service, {
    mode,
    agent_id: agent.id,
    service_id: service.service_id,
    network: ctx.net,
    task: options.task,
    quote_id: options.quote_id,
    option_id: options.option_id,
  });
}

export function isFreshQuote(snapshot: QuoteSnapshot, now = new Date()): boolean {
  const expiresAt = Date.parse(snapshot.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function quoteSnapshotFromRequirement(
  agent: Agent,
  service: AgentService,
  requirement: X402Requirement,
  observedAt: Date,
): QuoteSnapshot {
  return {
    agent_id: agent.id,
    service_id: service.service_id,
    amount: requirement.amount,
    asset: requirement.asset,
    pay_to: requirement.pay_to,
    ...(requirement.network ? { network: requirement.network } : {}),
    ...(requirement.resource ? { resource: requirement.resource } : {}),
    ...(requirement.nonce ? { nonce: requirement.nonce } : {}),
    observed_at: observedAt.toISOString(),
    expires_at: requirement.expires_at ?? new Date(observedAt.getTime() + QUOTE_TTL_MS).toISOString(),
    source: service.source ?? 'unknown',
  };
}

export async function refreshQuoteForService(
  ctx: QuoteCtx,
  agent: Agent,
  service: AgentService,
  options: {
    task?: string;
    fetchPaymentRequirement?: X402RequirementFetcher;
  } = {},
): Promise<QuoteSnapshot | null> {
  try {
    const observedAt = new Date();
    const requirement = await requirementForService(ctx, agent, service, 'quote', {
      task: options.task,
      fetchPaymentRequirement: options.fetchPaymentRequirement,
    });
    const snapshot = quoteSnapshotFromRequirement(agent, service, requirement, observedAt);
    ctx.quoteCache.set(quoteCacheKey(agent.id, service.service_id), snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export async function refreshQuotes(
  ctx: QuoteCtx,
  service_id?: string,
  options: {
    fetchPaymentRequirement?: X402RequirementFetcher;
    warn?: (message: string) => void;
  } = {},
): Promise<QuoteRefreshResult> {
  const serviceIds = service_id
    ? [service_id]
    : [...new Set(ctx.services.map((service) => service.service_id))].sort();
  const snapshots: QuoteSnapshot[] = [];
  const errors: QuoteRefreshResult['errors'] = [];

  for (const id of serviceIds) {
    const services = discoverServices(ctx, id);
    for (const service of services) {
      const agent = ctx.agents.get(service.agent_id);
      if (!agent) continue;
      const snapshot = await refreshQuoteForService(ctx, agent, service, {
        fetchPaymentRequirement: options.fetchPaymentRequirement,
      });
      if (snapshot) {
        snapshots.push(snapshot);
      } else {
        const error = `quote refresh failed: ${agent.name} ${service.service_id}`;
        errors.push({ agent_id: service.agent_id, service_id: service.service_id, error });
        options.warn?.(error);
      }
    }
  }

  return { snapshots, errors };
}

async function freshQuoteForService(
  ctx: QuoteCtx,
  agent: Agent,
  service: AgentService,
  options: {
    task?: string;
    fetchPaymentRequirement?: X402RequirementFetcher;
  } = {},
): Promise<QuoteSnapshot | null> {
  const cached = ctx.quoteCache.get(quoteCacheKey(agent.id, service.service_id));
  if (cached && isFreshQuote(cached)) return cached;
  return refreshQuoteForService(ctx, agent, service, options);
}

export function activeQuoteFromSnapshot(
  ctx: Pick<Ctx, 'activeQuotes' | 'paymentRequirements'>,
  snapshot: QuoteSnapshot,
): { quote: ActiveQuote; paymentRequirement: PaymentRequirement } {
  const quote: ActiveQuote = {
    quote_id: uuidv4(),
    agent_id: snapshot.agent_id,
    service_id: snapshot.service_id,
    amount: snapshot.amount,
    asset: snapshot.asset,
    pay_to: snapshot.pay_to,
    observed_at: new Date().toISOString(),
    expires_at: snapshot.expires_at,
  };
  const paymentRequirement: PaymentRequirement = {
    quote_id: quote.quote_id,
    amount: snapshot.amount,
    asset: snapshot.asset,
    pay_to: snapshot.pay_to,
    ...(snapshot.network ? { network: snapshot.network } : {}),
    ...(snapshot.resource ? { resource: snapshot.resource } : {}),
    ...(snapshot.nonce ? { nonce: snapshot.nonce } : {}),
    expires_at: snapshot.expires_at,
  };

  ctx.activeQuotes.set(quote.quote_id, quote);
  ctx.paymentRequirements.set(quote.quote_id, paymentRequirement);
  return { quote, paymentRequirement };
}

export async function candidateFor(
  ctx: RegistryCtx,
  agent: Agent,
  service: AgentService,
  reputation: number,
  task = '',
  options: { fetchPaymentRequirement?: X402RequirementFetcher } = {},
): Promise<RoutedCandidate> {
  const snapshot = await freshQuoteForService(ctx, agent, service, {
    task,
    fetchPaymentRequirement: options.fetchPaymentRequirement,
  });
  if (!snapshot) {
    throw Object.assign(new Error(`Missing fresh quote: ${serviceKey(agent.id, service.service_id)}`), { status: 502 });
  }
  return { agent, service, quote: snapshot, reputation };
}

export async function paymentRequirementForExecution(ctx: Pick<Ctx, 'net' | 'agents' | 'services' | 'paymentRequirements'>, option: RouteOption): Promise<PaymentRequirement> {
  const stored = ctx.paymentRequirements.get(option.quote_id);
  const agent = ctx.agents.get(option.agent_id);
  if (!agent) throw Object.assign(new Error(`Unknown agent: ${option.agent_id}`), { status: 400 });

  const service = ctx.services.find((candidate) => {
    return candidate.agent_id === option.agent_id && candidate.service_id === option.service_id;
  });

  if (!service || service.source !== 'agent_uri') {
    if (stored) return stored;
    throw Object.assign(new Error(`Unknown payment requirement: ${option.quote_id}`), { status: 400 });
  }

  const requirement = await requirementForService(ctx, agent, service, 'execute', {
    quote_id: option.quote_id,
    option_id: option.option_id,
  });

  return {
    quote_id: option.quote_id,
    amount: requirement.amount,
    asset: requirement.asset,
    pay_to: requirement.pay_to,
    ...(requirement.network ? { network: requirement.network } : {}),
    ...(requirement.resource ? { resource: requirement.resource } : {}),
    ...(requirement.nonce ? { nonce: requirement.nonce } : {}),
    ...(requirement.expires_at ? { expires_at: requirement.expires_at } : {}),
  };
}

export function discoveryOptions(
  ctx: Pick<Ctx, 'activeQuotes' | 'paymentRequirements'>,
  candidates: RoutedCandidate[],
): RouteOption[] {
  const prices = candidates.map((candidate) => candidate.quote.amount);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const priceScore = (price: number): number => (max === min ? 100 : ((max - price) / (max - min)) * 100);

  return candidates
    .map((candidate) => {
      const trust_score = Math.round(
        (priceScore(candidate.quote.amount) * 0.4) + (candidate.reputation * 0.6),
      );
      return { candidate, trust_score };
    })
    .sort((a, b) => b.trust_score - a.trust_score)
    .map(({ candidate, trust_score }, index) => {
      const { quote } = activeQuoteFromSnapshot(ctx, candidate.quote);
      return {
        option_id: `${quote.quote_id}:opt-${index + 1}`,
        agent_id: candidate.agent.id,
        service_id: candidate.service.service_id,
        quote_id: quote.quote_id,
        name: candidate.agent.name,
        price: quote.amount,
        asset: quote.asset,
        pay_to: quote.pay_to,
        reputation: candidate.reputation,
        trust_score,
      };
    });
}

export async function buildServicesCatalog(
  ctx: CatalogCtx,
  registryAgentIdFor: (agent_id: string) => string | null = () => null,
): Promise<{
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
}> {
  const serviceIds = [...new Set(ctx.services.map((service) => service.service_id))].sort();
  const services = await Promise.all(serviceIds.map(async (service_id) => {
    const groupServices = discoverServices(ctx, service_id);
    if (groupServices.length === 0) return null;

    const first = groupServices[0];
    const options = (await Promise.all(groupServices.map(async (service) => {
      const agent = ctx.agents.get(service.agent_id);
      if (!agent) return [];

      const snapshot = await freshQuoteForService(ctx, agent, service).catch(() => null);
      if (!snapshot) return [];

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
          amount: snapshot.amount,
          asset: snapshot.asset,
          pay_to: snapshot.pay_to,
        },
        trust: {
          reputation: rep.score,
          reads_logged: rep.reads_logged,
          corrections_logged: rep.corrections_logged,
        },
      }];
    }))).flat().sort((a, b) => a.agent.name.localeCompare(b.agent.name));

    if (options.length === 0) return null;

    return {
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
    };
  }));

  return {
    network: ctx.net,
    generated_at: new Date().toISOString(),
    services: services.filter((service): service is NonNullable<typeof service> => service !== null),
  };
}

export { DEFAULT_REPUTATION, DEFAULT_SERVICE_ID };
