// Reza's lane — owns this file.
import algosdk from 'algosdk';
import type { Ctx, Provider, RouteOption } from './contract.js';

const DEFAULT_REGISTER = 'Diligence';
const DISCOVERY_REPUTATION = 50;
const DISCOVERY_VALIDATION_RATE = 0.5;
const DISCOVERY_TRUST_SCORE = 50;

type RegistryCtx = Pick<Ctx, 'net' | 'providers'>;

export type ProviderRegistration = Omit<Provider, 'id'> & {
  id?: string;
};

export type ProviderIdentity = {
  provider_id: string;
  name: string;
  address: string;
  registers: string[];
  quote: number;
  asset: string;
  quality: number;
  dishonest: boolean;
  agent_uri: string;
};

export function providerId(net: string, address: string): string {
  const trimmed = address.trim();
  return `algorand:${net}:${trimmed}`;
}

export function registerProvider(ctx: RegistryCtx, input: ProviderRegistration): Provider {
  const register = input.register.trim();
  if (!algosdk.isValidAddress(register)) {
    throw Object.assign(new Error(`Invalid Algorand provider address: ${register}`), { status: 400 });
  }

  const provider: Provider = {
    ...input,
    id: input.id ?? providerId(ctx.net, register),
    register,
    agent_uri: input.agent_uri.trim(),
  };

  if (!provider.agent_uri) {
    throw Object.assign(new Error('agent_uri is required'), { status: 400 });
  }

  if (ctx.providers.has(provider.id)) {
    throw Object.assign(new Error(`Duplicate provider id: ${provider.id}`), { status: 409 });
  }

  ctx.providers.set(provider.id, provider);
  return provider;
}

export function providerRegisters(_provider: Provider): string[] {
  // Identity-only hack path: the seeded providers advertise Diligence.
  // Future live adapters can source this from the ERC-8004 agent registration file.
  return [DEFAULT_REGISTER];
}

export function discover(providers: Iterable<Provider>, register = DEFAULT_REGISTER): Provider[] {
  return [...providers].filter((provider) => providerRegisters(provider).includes(register));
}

export function providerIdentity(provider: Provider): ProviderIdentity {
  return {
    provider_id: provider.id,
    name: provider.name,
    address: provider.register,
    registers: providerRegisters(provider),
    quote: provider.quote,
    asset: provider.asset,
    quality: provider.quality,
    dishonest: provider.dishonest,
    agent_uri: provider.agent_uri,
  };
}

export function discoveryOptions(providers: Provider[], route_id: string): RouteOption[] {
  const weight = providers.length > 0 ? Math.round((100 / providers.length) * 100) / 100 : 0;

  return providers.map((provider, index) => ({
    option_id: `${route_id}:opt-${index + 1}`,
    provider_id: provider.id,
    name: provider.name,
    price: provider.quote,
    reputation: DISCOVERY_REPUTATION,
    validation_rate: DISCOVERY_VALIDATION_RATE,
    trust_score: DISCOVERY_TRUST_SCORE,
    weight,
  }));
}
