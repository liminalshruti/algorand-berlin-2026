import { test } from 'node:test';
import assert from 'node:assert/strict';
import algosdk from 'algosdk';
import type { Agent, Ctx } from './contract.js';
import { agentId, discoverServices, registerAgentLocal, registerServiceLocal } from './agents.js';
import { makeAgentRoutes } from './routes.agents.js';

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
  assert.ok(ctx.routeStore.has(body.route_id));
  assert.equal(ctx.routeStore.get(body.route_id)?.options[0].option_id, body.options[0].option_id);
});
