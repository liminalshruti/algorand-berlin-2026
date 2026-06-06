import { test } from 'node:test';
import assert from 'node:assert/strict';
import algosdk from 'algosdk';
import type { Ctx, Provider } from './contract.js';
import { discover, providerId, registerProvider } from './providers.js';
import { makeProviderRoutes } from './routes.providers.js';

function addr(): string {
  return algosdk.generateAccount().addr.toString();
}

function mockCtx(): Ctx {
  return {
    net: 'localnet',
    store: null,
    session: {
      payer: { addr: 'PAYER', sk: new Uint8Array(64) },
      facilitator: { addr: 'FAC', sk: new Uint8Array(64) },
      funded: { addr: 'PAYER', sk: new Uint8Array(64) },
    },
    providers: new Map(),
    routeStore: new Map(),
    paymentStore: new Map(),
    repState: { getReputation: () => null },
    ledger: [],
    deps: {
      settle: async () => ({ txid: 'settle-txid', round: 1 }),
      anchorNote: async () => ({ txid: 'anchor-txid', round: 1 }),
      buildReputationEntry: (id, score) => ({ id, score }),
      anchorReputationEntry: async () => 'rep-txid',
      explorerFor: (txid) => `https://example.com/${txid}`,
    },
  };
}

function providerInput(address = addr()): Omit<Provider, 'id'> {
  return {
    name: 'Helios Diligence',
    register: address,
    quote: 0.1,
    asset: 'ALGO',
    quality: 0.9,
    dishonest: false,
    agent_uri: `https://agents.local/${address}`,
  };
}

test('providerId formats Algorand-native provider identity', () => {
  const address = addr();
  assert.equal(providerId('localnet', address), `algorand:localnet:${address}`);
});

test('registerProvider stores provider identity and preserves agent_uri', () => {
  const ctx = mockCtx();
  const input = providerInput();
  const provider = registerProvider(ctx, input);

  assert.equal(provider.id, providerId(ctx.net, input.register));
  assert.equal(provider.agent_uri, input.agent_uri);
  assert.equal(ctx.providers.get(provider.id), provider);
});

test('registerProvider rejects duplicate provider ids', () => {
  const ctx = mockCtx();
  const input = providerInput();
  registerProvider(ctx, input);

  assert.throws(
    () => registerProvider(ctx, input),
    (err: Error & { status?: number }) => {
      assert.equal(err.status, 409);
      return true;
    },
  );
});

test('discover returns Diligence providers and excludes unsupported registers', () => {
  const ctx = mockCtx();
  const provider = registerProvider(ctx, providerInput());

  assert.deepEqual(discover(ctx.providers.values(), 'Diligence'), [provider]);
  assert.deepEqual(discover(ctx.providers.values(), 'Operations'), []);
});

test('GET /api/providers returns provider identities and agent_uri', async () => {
  const ctx = mockCtx();
  const provider = registerProvider(ctx, providerInput());
  const router = makeProviderRoutes(ctx);

  const res = await router.request('/api/providers?register=Diligence');
  assert.equal(res.status, 200);

  const body = await res.json() as {
    providers: Array<{ provider_id: string; agent_uri: string }>;
  };

  assert.equal(body.providers.length, 1);
  assert.equal(body.providers[0].provider_id, provider.id);
  assert.equal(body.providers[0].agent_uri, provider.agent_uri);
});

test('POST /api/route returns RouteOptions and stores route for /api/pay', async () => {
  const ctx = mockCtx();
  const provider = registerProvider(ctx, providerInput());
  const router = makeProviderRoutes(ctx);

  const res = await router.request('/api/route', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: 'Run diligence', register: 'Diligence' }),
  });
  assert.equal(res.status, 200);

  const body = await res.json() as {
    route_id: string;
    options: Array<{ option_id: string; provider_id: string }>;
  };

  assert.equal(body.options.length, 1);
  assert.equal(body.options[0].provider_id, provider.id);
  assert.ok(ctx.routeStore.has(body.route_id));
  assert.equal(ctx.routeStore.get(body.route_id)?.options[0].option_id, body.options[0].option_id);
});
