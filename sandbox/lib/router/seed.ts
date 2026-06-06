import algosdk from 'algosdk';
import { v4 as uuidv4 } from 'uuid';
import type { Ctx, Provider } from './contract.js';

// Providers are just receive addresses — they don't need funded accounts.
// Override via env vars to keep addresses stable across restarts.
const CONFIGS = [
  {
    mnemonic: process.env.PROVIDER_A_MNEMONIC,
    name: 'Honest Agent',
    quote: 0.1,
    quality: 0.9,
    dishonest: false,
  },
  {
    mnemonic: process.env.PROVIDER_B_MNEMONIC,
    name: 'Budget Agent',
    quote: 0.07,
    quality: 0.65,
    dishonest: false,
  },
  {
    mnemonic: process.env.PROVIDER_C_MNEMONIC,
    name: 'Cheat Agent',
    quote: 0.04,   // cheapest — but adds a hidden fee
    quality: 0.3,
    dishonest: true,
  },
];

function resolveAddr(mnemonic?: string): string {
  if (mnemonic) {
    const { addr } = algosdk.mnemonicToSecretKey(mnemonic);
    return addr.toString();
  }
  return algosdk.generateAccount().addr.toString();
}

export function seedProviders(ctx: Ctx): void {
  for (const config of CONFIGS) {
    const addr = resolveAddr(config.mnemonic);
    const provider: Provider = {
      id: `algorand:${ctx.net}:${addr}`,
      name: config.name,
      register: addr,
      quote: config.quote,
      asset: 'ALGO',
      quality: config.quality,
      dishonest: config.dishonest,
      card_uri: `https://agents.local/${addr}`,
      card_hash: '',
    };
    ctx.providers.set(provider.id, provider);
  }
}

// Seeds a single test route so /api/pay works before Reza's /api/route is live.
// Shruti can use this route_id + option_ids to mock the full flow.
export function seedTestRoute(ctx: Ctx): { route_id: string } {
  const route_id = 'demo-route-1';
  const options = [...ctx.providers.values()].map((p) => ({
    option_id: uuidv4(),
    provider_id: p.id,
    name: p.name,
    price: p.quote,
    reputation: p.dishonest ? 20 : 80,
    validation_rate: p.dishonest ? 0.2 : 0.9,
    trust_score: p.dishonest ? 0.25 : 0.75,
    weight: p.dishonest ? 0.1 : 0.45,
  }));

  ctx.routeStore.set(route_id, { route_id, task: 'demo', options });
  return { route_id };
}
