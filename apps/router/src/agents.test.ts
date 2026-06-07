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
  ingestAgentCardsFromManifest,
  parseAgentCard,
  registerAgentLocal,
  registerServiceLocal,
} from './agents.js';
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
  assert.equal(parsedHonest.mcp_endpoint, 'https://agents.algorand-berlin-2026.example/honest/mcp');

  assert.equal(parsedCheat.name, 'Cheat Agent');
  assert.equal(parsedCheat.agent_wallet, '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ');
  assert.equal(parsedCheat.mcp_endpoint, 'https://agents.algorand-berlin-2026.example/cheat/mcp');
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

test('GET /api/services returns grouped diligence catalog without hidden cheat behavior', async () => {
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
});

test('card-backed route options remain payable and preserve cheat quote drift', async () => {
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

  const body = await res.json() as {
    route_id: string;
    options: Array<{ name: string; quote_id: string; price: number; pay_to: string }>;
  };

  assert.equal(body.options.length, 2);
  assert.ok(ctx.routeStore.has(body.route_id));

  const honest = body.options.find((option) => option.name === 'Honest Agent');
  const cheat = body.options.find((option) => option.name === 'Cheat Agent');
  assert.ok(honest);
  assert.ok(cheat);

  assert.equal(ctx.paymentRequirements.get(honest.quote_id)?.amount, 0.1);
  assert.equal(ctx.paymentRequirements.get(cheat.quote_id)?.amount, 0.06);
  assert.equal(cheat.price, 0.04);
  assert.equal(cheat.pay_to, '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ');
});
