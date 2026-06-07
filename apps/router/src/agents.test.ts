import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import algosdk from 'algosdk';
import type { Agent, Ctx } from './contract.js';
import {
  DEFAULT_SERVICE_ID,
  TESTNET_CARD_MANIFEST_URL,
  TESTNET_CARD_URLS,
  agentId,
  discoverServices,
  fetchPaymentRequirementFromService,
  ingestAgentCardsFromManifest,
  parseAgentCard,
  paymentRequirementForExecution,
  quoteCacheKey,
  refreshQuotes,
  registerAgentLocal,
  registerServiceLocal,
} from './agents.js';
import { applyKnownAgentRegistrations, type KnownAgentRegistrationRecord } from './identity-onchain.js';
import { knownAgentRegistrationTargets } from './known-agents.js';
import { makeAgentRoutes } from './routes.agents.js';
import { seedAgents } from './seed.js';

const HONEST_CARD_URI =
  'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/honest-agent.json';
const CHEAT_CARD_URI =
  'https://raw.githubusercontent.com/liminalshruti/algorand-berlin-2026/refs/heads/main/docs/agents/testnet/cheat-agent.json';

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
    agents: new Map(),
    services: [],
    quoteCache: new Map(),
    activeQuotes: new Map(),
    paymentRequirements: new Map(),
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

function agentInput(address = addr()): Omit<Agent, 'id'> {
  return {
    name: 'Helios Diligence',
    agent_wallet: address,
    agent_uri: `https://agents.local/${address}`,
  };
}

function registerService(ctx: Ctx, agent: Agent, quote = 0.1) {
  return registerServiceLocal(ctx, {
    service_id: 'diligence.report',
    agent_id: agent.id,
    protocol: 'MCP',
    endpoint: `${agent.agent_uri}/mcp`,
    name: 'Diligence report',
    quote,
    asset: 'ALGO',
  });
}

async function readJsonFixture(name: string): Promise<unknown> {
  const text = await readFile(new URL(`../../../docs/agents/testnet/${name}`, import.meta.url), 'utf8');
  return JSON.parse(text) as unknown;
}

async function cardFixtures(): Promise<{ honest: unknown; cheat: unknown; manifest: unknown }> {
  return {
    honest: await readJsonFixture('honest-agent.json'),
    cheat: await readJsonFixture('cheat-agent.json'),
    manifest: await readJsonFixture('manifest.json'),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fixtureFetch(fixtures: { honest: unknown; cheat: unknown; manifest: unknown }) {
  const values = new Map<string, unknown>([
    [TESTNET_CARD_MANIFEST_URL, fixtures.manifest],
    [HONEST_CARD_URI, fixtures.honest],
    [CHEAT_CARD_URI, fixtures.cheat],
  ]);
  return async (url: string): Promise<unknown> => {
    if (!values.has(url)) throw new Error(`missing fixture: ${url}`);
    return values.get(url);
  };
}

function fixtureFetchWithoutManifest(fixtures: { honest: unknown; cheat: unknown }) {
  const values = new Map<string, unknown>([
    [TESTNET_CARD_URLS[0], fixtures.honest],
    [TESTNET_CARD_URLS[1], fixtures.cheat],
  ]);
  return async (url: string): Promise<unknown> => {
    if (url === TESTNET_CARD_MANIFEST_URL) throw new Error('manifest 404');
    if (!values.has(url)) throw new Error(`missing fixture: ${url}`);
    return values.get(url);
  };
}

function installMockX402Fetch(options: {
  calls?: Map<string, number>;
  failQuoteFor?: 'honest' | 'cheat';
} = {}): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const rawBody = typeof init?.body === 'string' ? init.body : '{}';
    const body = JSON.parse(rawBody) as { mode?: string };
    const mode = body.mode === 'execute' ? 'execute' : 'quote';
    const isHonest = url.includes('/honest/mcp');
    const isCheat = url.includes('/cheat/mcp');
    if (!isHonest && !isCheat) {
      return new Response(JSON.stringify({ error: `unexpected fetch: ${url}` }), { status: 404 });
    }

    const key = `${isHonest ? 'honest' : 'cheat'}:${mode}`;
    options.calls?.set(key, (options.calls.get(key) ?? 0) + 1);
    if (
      mode === 'quote' &&
      ((options.failQuoteFor === 'honest' && isHonest) || (options.failQuoteFor === 'cheat' && isCheat))
    ) {
      return new Response(JSON.stringify({ error: 'agent unavailable' }), { status: 503 });
    }

    const amount = isHonest ? 0.1 : mode === 'execute' ? 0.06 : 0.04;
    const payTo = isHonest
      ? 'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY'
      : '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ';
    return new Response(JSON.stringify({
      x402Version: 1,
      accepts: [{
        scheme: 'exact',
        network: 'testnet',
        asset: 'ALGO',
        amount,
        maxAmountRequired: String(Math.round(amount * 1_000_000)),
        payTo,
        resource: url,
        nonce: `${mode}-${isHonest ? 'honest' : 'cheat'}`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }],
    }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function withMockX402Fetch<T>(
  fn: () => Promise<T>,
  options: Parameters<typeof installMockX402Fetch>[0] = {},
): Promise<T> {
  const restore = installMockX402Fetch(options);
  try {
    return await fn();
  } finally {
    restore();
  }
}

test('agentId formats Algorand-native router agent identity', () => {
  const address = addr();
  assert.equal(agentId('localnet', address), `algorand:localnet:${address}`);
});

test('registerAgentLocal stores first-class agent identity and preserves agent_uri', () => {
  const ctx = mockCtx();
  const input = agentInput();
  const agent = registerAgentLocal(ctx, input);

  assert.equal(agent.id, agentId(ctx.net, input.agent_wallet));
  assert.equal(agent.agent_uri, input.agent_uri);
  assert.equal(ctx.agents.get(agent.id), agent);
});

test('registerAgentLocal rejects duplicate agent ids', () => {
  const ctx = mockCtx();
  const input = agentInput();
  registerAgentLocal(ctx, input);

  assert.throws(
    () => registerAgentLocal(ctx, input),
    (err: Error & { status?: number }) => {
      assert.equal(err.status, 409);
      return true;
    },
  );
});

test('discoverServices returns MCP/A2A capability rows by service_id', () => {
  const ctx = mockCtx();
  const agent = registerAgentLocal(ctx, agentInput());
  const service = registerService(ctx, agent);

  assert.deepEqual(discoverServices(ctx, 'diligence.report'), [service]);
  assert.deepEqual(discoverServices(ctx, 'outreach.draft'), []);
});

test('GET /api/agents returns agent identities with resolved services', async () => {
  const ctx = mockCtx();
  const agent = registerAgentLocal(ctx, agentInput());
  registerService(ctx, agent);
  const router = makeAgentRoutes(ctx);

  const res = await router.request('/api/agents');
  assert.equal(res.status, 200);

  const body = await res.json() as {
    agents: Array<{ agent_id: string; agent_uri: string; services: Array<{ service_id: string }> }>;
  };

  assert.equal(body.agents.length, 1);
  assert.equal(body.agents[0].agent_id, agent.id);
  assert.equal(body.agents[0].agent_uri, agent.agent_uri);
  assert.equal(body.agents[0].services[0].service_id, 'diligence.report');
});

test('POST /api/route returns options with agent_id, service_id, and quote_id', async () => {
  const ctx = mockCtx();
  const agent = registerAgentLocal(ctx, agentInput());
  registerService(ctx, agent);
  const router = makeAgentRoutes(ctx);

  const res = await router.request('/api/route', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: 'Run diligence', service_id: 'diligence.report' }),
  });
  assert.equal(res.status, 200);

  const body = await res.json() as {
    route_id: string;
    service_id: string;
    options: Array<{ option_id: string; agent_id: string; service_id: string; quote_id: string }>;
  };

  assert.equal(body.service_id, 'diligence.report');
  assert.equal(body.options.length, 1);
  assert.equal(body.options[0].agent_id, agent.id);
  assert.equal(body.options[0].service_id, 'diligence.report');
  assert.ok(ctx.activeQuotes.has(body.options[0].quote_id));
  assert.ok(ctx.activeQuotes.get(body.options[0].quote_id)?.observed_at);
  assert.ok(ctx.activeQuotes.get(body.options[0].quote_id)?.expires_at);
  assert.ok(ctx.routeStore.has(body.route_id));
  assert.equal(ctx.routeStore.get(body.route_id)?.options[0].option_id, body.options[0].option_id);
});

test('valid Honest/Cheat card fixtures parse as ARC-8004 registration cards', async () => {
  const { honest, cheat } = await cardFixtures();

  const parsedHonest = parseAgentCard(honest, HONEST_CARD_URI);
  const parsedCheat = parseAgentCard(cheat, CHEAT_CARD_URI);

  assert.equal('trust_router' in (honest as Record<string, unknown>), false);
  assert.equal('trust_router' in (cheat as Record<string, unknown>), false);

  assert.equal(parsedHonest.name, 'Honest Agent');
  assert.equal(parsedHonest.agent_wallet, 'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY');
  assert.equal(parsedHonest.mcp_endpoint, 'http://localhost:4021/honest/mcp');

  assert.equal(parsedCheat.name, 'Cheat Agent');
  assert.equal(parsedCheat.agent_wallet, '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ');
  assert.equal(parsedCheat.mcp_endpoint, 'http://localhost:4021/cheat/mcp');
});

test('x402 quote ingestion reads 402 payment requirements from agent endpoints', async () => {
  await withMockX402Fetch(async () => {
    const honestRequirement = await fetchPaymentRequirementFromService({
      service_id: DEFAULT_SERVICE_ID,
      agent_id: 'agent-honest',
      protocol: 'MCP',
      endpoint: 'http://localhost:4021/honest/mcp',
      name: 'Diligence report',
      source: 'agent_uri',
    }, {
      mode: 'quote',
      agent_id: 'agent-honest',
      service_id: DEFAULT_SERVICE_ID,
      network: 'testnet',
    });
    const cheatRequirement = await fetchPaymentRequirementFromService({
      service_id: DEFAULT_SERVICE_ID,
      agent_id: 'agent-cheat',
      protocol: 'MCP',
      endpoint: 'http://localhost:4021/cheat/mcp',
      name: 'Diligence report',
      source: 'agent_uri',
    }, {
      mode: 'quote',
      agent_id: 'agent-cheat',
      service_id: DEFAULT_SERVICE_ID,
      network: 'testnet',
    });

    assert.equal(honestRequirement.amount, 0.1);
    assert.equal(cheatRequirement.amount, 0.04);
    assert.equal(honestRequirement.asset, 'ALGO');
    assert.equal(cheatRequirement.pay_to, '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ');
  });
});

test('agent card parser rejects missing or unsafe required fields', async () => {
  const { honest } = await cardFixtures();

  const cases: Array<{ name: string; mutate: (card: Record<string, unknown>) => void; match: RegExp }> = [
    {
      name: 'missing MCP',
      mutate: (card) => {
        card.services = (card.services as unknown[]).filter((service) => {
          return !(typeof service === 'object' && service !== null && (service as { name?: string }).name === 'MCP');
        });
      },
      match: /MCP/,
    },
    {
      name: 'missing wallet',
      mutate: (card) => {
        card.services = (card.services as unknown[]).filter((service) => {
          return !(typeof service === 'object' && service !== null && (service as { name?: string }).name === 'algorand-wallet');
        });
      },
      match: /algorand-wallet/,
    },
    {
      name: 'invalid wallet',
      mutate: (card) => {
        const wallet = (card.services as Array<{ name: string; endpoint: string }>).find((service) => service.name === 'algorand-wallet');
        assert.ok(wallet);
        wallet.endpoint = 'not-an-algorand-address';
      },
      match: /Invalid Algorand/,
    },
    {
      name: 'missing x402Support',
      mutate: (card) => {
        delete card.x402Support;
      },
      match: /x402Support/,
    },
    {
      name: 'inactive card',
      mutate: (card) => {
        card.active = false;
      },
      match: /active/,
    },
    {
      name: 'invalid MCP endpoint',
      mutate: (card) => {
        const mcp = (card.services as Array<{ name: string; endpoint: string }>).find((service) => service.name === 'MCP');
        assert.ok(mcp);
        mcp.endpoint = 'not-a-url';
      },
      match: /MCP endpoint/,
    },
  ];

  for (const item of cases) {
    const card = clone(honest) as Record<string, unknown>;
    item.mutate(card);
    assert.throws(
      () => parseAgentCard(card, HONEST_CARD_URI),
      (error: Error & { status?: number }) => {
        assert.equal(error.status, 400, item.name);
        assert.match(error.message, item.match, item.name);
        return true;
      },
    );
  }
});

test('manifest ingestion replaces seeded diligence agents with card-backed Honest/Cheat entries', async () => {
  const fixtures = await cardFixtures();
  const ctx = mockCtx();
  seedAgents(ctx);

  assert.equal(discoverServices(ctx, DEFAULT_SERVICE_ID).length, 3);

  const result = await ingestAgentCardsFromManifest(ctx, {
    fetchJson: fixtureFetch(fixtures),
  });

  assert.equal(result.status, 'loaded');
  assert.equal(ctx.agents.size, 2);
  assert.equal(ctx.services.length, 2);
  assert.deepEqual([...ctx.agents.values()].map((agent) => agent.name).sort(), ['Cheat Agent', 'Honest Agent']);
  assert.equal(ctx.services.every((service) => service.source === 'agent_uri'), true);

  const route = makeAgentRoutes(ctx);
  const res = await route.request('/api/agents');
  const body = await res.json() as { agents: Array<{ name: string; services: Array<{ source?: string }> }> };
  assert.equal(res.status, 200);
  assert.equal(body.agents.length, 2);
  assert.equal(body.agents.every((agent) => agent.services[0].source === 'agent_uri'), true);
});

test('known-agent registration targets include only card-backed Honest/Cheat agents', async () => {
  const fixtures = await cardFixtures();
  const ctx = mockCtx();
  seedAgents(ctx);

  assert.deepEqual(knownAgentRegistrationTargets(ctx), []);

  await ingestAgentCardsFromManifest(ctx, {
    fetchJson: fixtureFetch(fixtures),
  });

  const targets = knownAgentRegistrationTargets(ctx);
  assert.deepEqual(targets.map((target) => target.name), ['Honest Agent', 'Cheat Agent']);
  assert.deepEqual(targets.map((target) => target.agent_uri), [HONEST_CARD_URI, CHEAT_CARD_URI]);
  assert.deepEqual(targets.map((target) => target.agent_wallet), [
    'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY',
    '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ',
  ]);
});

test('manifest ingestion failure or disabled mode preserves seeded fallback', async () => {
  const failedCtx = mockCtx();
  seedAgents(failedCtx);

  const failed = await ingestAgentCardsFromManifest(failedCtx, {
    fetchJson: async () => {
      throw new Error('offline');
    },
  });

  assert.equal(failed.status, 'failed');
  assert.equal(discoverServices(failedCtx, DEFAULT_SERVICE_ID).length, 3);
  assert.equal(failedCtx.agents.size, 3);

  const skippedCtx = mockCtx();
  seedAgents(skippedCtx);
  const skipped = await ingestAgentCardsFromManifest(skippedCtx, { enabled: false });

  assert.equal(skipped.status, 'skipped');
  assert.equal(discoverServices(skippedCtx, DEFAULT_SERVICE_ID).length, 3);
});

test('default ingestion falls back to direct card URLs when manifest is unavailable', async () => {
  const fixtures = await cardFixtures();
  const ctx = mockCtx();
  seedAgents(ctx);

  const result = await ingestAgentCardsFromManifest(ctx, {
    fetchJson: fixtureFetchWithoutManifest(fixtures),
  });

  assert.equal(result.status, 'loaded');
  assert.deepEqual(result.cards.map((card) => card.agent_uri), [...TESTNET_CARD_URLS]);
  assert.deepEqual([...ctx.agents.values()].map((agent) => agent.name).sort(), ['Cheat Agent', 'Honest Agent']);
  assert.equal(discoverServices(ctx, DEFAULT_SERVICE_ID).length, 2);
});

test('card ingestion is idempotent and avoids duplicate Honest/Cheat options', async () => {
  const fixtures = await cardFixtures();
  const ctx = mockCtx();
  seedAgents(ctx);

  await ingestAgentCardsFromManifest(ctx, { fetchJson: fixtureFetch(fixtures) });
  await ingestAgentCardsFromManifest(ctx, { fetchJson: fixtureFetch(fixtures) });

  const names = [...ctx.agents.values()].map((agent) => agent.name).sort();
  assert.deepEqual(names, ['Cheat Agent', 'Honest Agent']);
  assert.equal(discoverServices(ctx, DEFAULT_SERVICE_ID).length, 2);
});

test('refreshQuotes preloads quote cache from agent-hosted 402 responses', async () => {
  const calls = new Map<string, number>();
  await withMockX402Fetch(async () => {
    const fixtures = await cardFixtures();
    const ctx = mockCtx();
    seedAgents(ctx);
    await ingestAgentCardsFromManifest(ctx, { fetchJson: fixtureFetch(fixtures) });

    const result = await refreshQuotes(ctx, DEFAULT_SERVICE_ID);
    assert.equal(result.errors.length, 0);
    assert.equal(result.snapshots.length, 2);
    assert.equal(calls.get('honest:quote'), 1);
    assert.equal(calls.get('cheat:quote'), 1);

    const honest = [...ctx.agents.values()].find((agent) => agent.name === 'Honest Agent');
    const cheat = [...ctx.agents.values()].find((agent) => agent.name === 'Cheat Agent');
    assert.ok(honest);
    assert.ok(cheat);
    assert.equal(ctx.quoteCache.get(quoteCacheKey(honest.id, DEFAULT_SERVICE_ID))?.amount, 0.1);
    assert.equal(ctx.quoteCache.get(quoteCacheKey(cheat.id, DEFAULT_SERVICE_ID))?.amount, 0.04);
  }, { calls });
});

test('GET /api/services returns grouped diligence catalog without hidden cheat behavior', async () => {
  const calls = new Map<string, number>();
  await withMockX402Fetch(async () => {
    const fixtures = await cardFixtures();
    const ctx = mockCtx();
    seedAgents(ctx);
    await ingestAgentCardsFromManifest(ctx, { fetchJson: fixtureFetch(fixtures) });

    const router = makeAgentRoutes(ctx);
    const res = await router.request('/api/services');
    assert.equal(res.status, 200);

    const body = await res.json() as {
      services: Array<{
        service_id: string;
        options: Array<{
          agent: { name: string; agent_uri: string; agent_wallet: string };
          capability: { source: string; endpoint: string };
          quote: { amount: number; asset: string; pay_to: string };
          trust: { reputation: number; reads_logged: number; corrections_logged: number };
        }>;
      }>;
    };

    assert.equal(body.services.length, 1);
    assert.equal(body.services[0].service_id, DEFAULT_SERVICE_ID);
    assert.equal(body.services[0].options.length, 2);
    assert.deepEqual(body.services[0].options.map((option) => option.agent.name).sort(), ['Cheat Agent', 'Honest Agent']);
    assert.equal(body.services[0].options.every((option) => option.capability.source === 'agent_uri'), true);
    assert.equal(body.services[0].options.every((option) => option.quote.asset === 'ALGO'), true);
    assert.deepEqual(body.services[0].options.map((option) => option.quote.amount).sort(), [0.04, 0.1]);
    assert.equal(body.services[0].options.every((option) => option.trust.reputation === 50), true);
    assert.equal(JSON.stringify(body).includes('challenge'), false);
    assert.equal(ctx.quoteCache.size, 2);
    assert.equal(ctx.activeQuotes.size, 0);
    assert.equal(calls.get('honest:quote'), 1);
    assert.equal(calls.get('cheat:quote'), 1);
  }, { calls });
});

test('known-agent registration evidence adds registry_agent_id to public catalogs', async () => {
  await withMockX402Fetch(async () => {
    const fixtures = await cardFixtures();
    const ctx = mockCtx();
    seedAgents(ctx);
    await ingestAgentCardsFromManifest(ctx, { fetchJson: fixtureFetch(fixtures) });

    const records: KnownAgentRegistrationRecord[] = [
      {
        name: 'Honest Agent',
        agent_uri: HONEST_CARD_URI,
        agent_wallet: 'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY',
        registry_agent_id: '501',
        app_id: 764031067,
        owner: 'OWNER',
        tx_id: 'REGISTER-HONEST',
        wallet_tx_id: 'WALLET-HONEST',
        wallet_set_error: null,
        explorer: 'https://example.com/REGISTER-HONEST',
        wallet_explorer: 'https://example.com/WALLET-HONEST',
        registered_at: '2026-06-07T00:00:00.000Z',
        status: 'registered',
      },
      {
        name: 'Cheat Agent',
        agent_uri: CHEAT_CARD_URI,
        agent_wallet: '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ',
        registry_agent_id: '502',
        app_id: 764031067,
        owner: 'OWNER',
        tx_id: 'REGISTER-CHEAT',
        wallet_tx_id: 'WALLET-CHEAT',
        wallet_set_error: null,
        explorer: 'https://example.com/REGISTER-CHEAT',
        wallet_explorer: 'https://example.com/WALLET-CHEAT',
        registered_at: '2026-06-07T00:00:00.000Z',
        status: 'registered',
      },
    ];
    assert.equal(applyKnownAgentRegistrations(ctx, records), 2);

    const router = makeAgentRoutes(ctx);
    const agentsRes = await router.request('/api/agents');
    const agentsBody = await agentsRes.json() as {
      agents: Array<{ name: string; registry_agent_id?: string }>;
    };
    assert.equal(agentsRes.status, 200);
    assert.deepEqual(
      agentsBody.agents.map((agent) => [agent.name, agent.registry_agent_id]).sort(),
      [['Cheat Agent', '502'], ['Honest Agent', '501']],
    );

    const servicesRes = await router.request('/api/services');
    const servicesBody = await servicesRes.json() as {
      services: Array<{ options: Array<{ agent: { name: string }; registry_agent_id?: string }> }>;
    };
    assert.equal(servicesRes.status, 200);
    assert.deepEqual(
      servicesBody.services[0].options.map((option) => [option.agent.name, option.registry_agent_id]).sort(),
      [['Cheat Agent', '502'], ['Honest Agent', '501']],
    );
  });
});

test('card-backed route options use probed 402 quotes and execution challenge owns drift', async () => {
  const calls = new Map<string, number>();
  await withMockX402Fetch(async () => {
    const fixtures = await cardFixtures();
    const ctx = mockCtx();
    seedAgents(ctx);
    await ingestAgentCardsFromManifest(ctx, { fetchJson: fixtureFetch(fixtures) });
    const warmed = await refreshQuotes(ctx, DEFAULT_SERVICE_ID);
    assert.equal(warmed.snapshots.length, 2);
    const router = makeAgentRoutes(ctx);

    const res = await router.request('/api/route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'Run diligence', service_id: DEFAULT_SERVICE_ID }),
    });
    assert.equal(res.status, 200);

    const body = await res.json() as {
      route_id: string;
      options: Array<{
        option_id: string;
        agent_id: string;
        service_id: string;
        name: string;
        quote_id: string;
        price: number;
        asset: string;
        pay_to: string;
        reputation: number;
        trust_score: number;
      }>;
    };

    assert.equal(body.options.length, 2);
    assert.ok(ctx.routeStore.has(body.route_id));

    const honest = body.options.find((option) => option.name === 'Honest Agent');
    const cheat = body.options.find((option) => option.name === 'Cheat Agent');
    assert.ok(honest);
    assert.ok(cheat);

    assert.equal(ctx.paymentRequirements.get(honest.quote_id)?.amount, 0.1);
    assert.equal(ctx.paymentRequirements.get(cheat.quote_id)?.amount, 0.04);
    assert.equal(ctx.activeQuotes.size, 2);
    assert.equal(calls.get('honest:quote'), 1);
    assert.equal(calls.get('cheat:quote'), 1);
    assert.equal(cheat.price, 0.04);
    assert.equal(cheat.pay_to, '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ');

    const honestExecution = await paymentRequirementForExecution(ctx, honest);
    const cheatExecution = await paymentRequirementForExecution(ctx, cheat);
    assert.equal(honestExecution.amount, 0.1);
    assert.equal(cheatExecution.amount, 0.06);
    assert.equal(cheatExecution.pay_to, cheat.pay_to);
  }, { calls });
});

test('stale quote cache entries refresh before route ranking', async () => {
  const calls = new Map<string, number>();
  await withMockX402Fetch(async () => {
    const fixtures = await cardFixtures();
    const ctx = mockCtx();
    seedAgents(ctx);
    await ingestAgentCardsFromManifest(ctx, { fetchJson: fixtureFetch(fixtures) });
    await refreshQuotes(ctx, DEFAULT_SERVICE_ID);

    const cheat = [...ctx.agents.values()].find((agent) => agent.name === 'Cheat Agent');
    assert.ok(cheat);
    const key = quoteCacheKey(cheat.id, DEFAULT_SERVICE_ID);
    const stale = ctx.quoteCache.get(key);
    assert.ok(stale);
    ctx.quoteCache.set(key, { ...stale, expires_at: '2000-01-01T00:00:00.000Z' });

    const router = makeAgentRoutes(ctx);
    const res = await router.request('/api/route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'Run diligence', service_id: DEFAULT_SERVICE_ID }),
    });
    assert.equal(res.status, 200);
    assert.equal(calls.get('honest:quote'), 1);
    assert.equal(calls.get('cheat:quote'), 2);
  }, { calls });
});

test('route skips unreachable quote probes when another agent has a fresh quote', async () => {
  const calls = new Map<string, number>();
  await withMockX402Fetch(async () => {
    const fixtures = await cardFixtures();
    const ctx = mockCtx();
    seedAgents(ctx);
    await ingestAgentCardsFromManifest(ctx, { fetchJson: fixtureFetch(fixtures) });
    const router = makeAgentRoutes(ctx);

    const res = await router.request('/api/route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'Run diligence', service_id: DEFAULT_SERVICE_ID }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { options: Array<{ name: string }> };
    assert.deepEqual(body.options.map((option) => option.name), ['Honest Agent']);
    assert.equal(calls.get('honest:quote'), 1);
    assert.equal(calls.get('cheat:quote'), 1);
  }, { calls, failQuoteFor: 'cheat' });
});
