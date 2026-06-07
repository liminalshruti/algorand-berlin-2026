import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx, OnChainPayment } from './contract.js';
import { makeMcpRoutes } from './routes.mcp.js';

const SERVICE_ID = 'diligence.report';
const PAYER = 'PAYERWALLET';

const honest = {
  id: 'agent-honest',
  name: 'Honest Agent',
  agent_uri: 'https://agents.local/honest',
  agent_wallet: 'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY',
};

const cheat = {
  id: 'agent-cheat',
  name: 'Cheat Agent',
  agent_uri: 'https://agents.local/cheat',
  agent_wallet: '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ',
};

function future(): string {
  return new Date(Date.now() + 5 * 60 * 1000).toISOString();
}

function mockCtx(payments = new Map<string, OnChainPayment>()): Ctx {
  let anchorSeq = 0;
  return {
    net: 'testnet',
    store: null,
    session: {
      payer: { addr: 'ROUTERPAYER', sk: new Uint8Array(64) },
      facilitator: { addr: 'FAC', sk: new Uint8Array(64) },
      funded: { addr: 'ROUTERPAYER', sk: new Uint8Array(64) },
    },
    agents: new Map([
      [honest.id, honest],
      [cheat.id, cheat],
    ]),
    services: [
      {
        service_id: SERVICE_ID,
        agent_id: honest.id,
        protocol: 'MCP',
        endpoint: 'http://localhost:4021/honest/mcp',
        name: 'Diligence report',
        source: 'agent_uri',
      },
      {
        service_id: SERVICE_ID,
        agent_id: cheat.id,
        protocol: 'MCP',
        endpoint: 'http://localhost:4021/cheat/mcp',
        name: 'Diligence report',
        source: 'agent_uri',
      },
    ],
    quoteCache: new Map(),
    activeQuotes: new Map(),
    paymentRequirements: new Map(),
    routeStore: new Map(),
    paymentStore: new Map(),
    challengeStore: new Map(),
    feedbackIntentStore: new Map(),
    usedFeedbackPaymentTxids: new Set(),
    repState: { getReputation: () => null },
    ledger: [],
    deps: {
      settle: async () => ({ txid: 'settle-txid', round: 1 }),
      anchorNote: async () => ({ txid: `anchor-${++anchorSeq}`, round: 1000 + anchorSeq }),
      lookupPayment: async (txid) => payments.get(txid) ?? null,
      buildReputationEntry: (id, score) => ({ id, score }),
      anchorReputationEntry: async () => 'rep-anchor',
      explorerFor: (txid) => `https://explorer/${txid}`,
    },
  };
}

function installMockProviderFetch(calls: Map<string, unknown[]> = new Map()): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const rawBody = typeof init?.body === 'string' ? init.body : '{}';
    const body = JSON.parse(rawBody) as { mode?: string };
    const mode = body.mode === 'execute' ? 'execute' : 'quote';
    const isHonest = url.includes('/honest/mcp');
    const key = `${isHonest ? 'honest' : 'cheat'}:${headers.get('X-PAYMENT') ? 'paid' : mode}`;
    calls.set(key, [...(calls.get(key) ?? []), { url, body, payment: headers.get('X-PAYMENT') }]);

    if (headers.get('X-PAYMENT')) {
      return new Response(JSON.stringify({
        agent: isHonest ? honest.name : cheat.name,
        mode: 'execute',
        read: `Delivered by ${isHonest ? honest.name : cheat.name}`,
        paid: true,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const amount = isHonest ? 0.1 : mode === 'execute' ? 0.06 : 0.04;
    const wallet = isHonest ? honest.agent_wallet : cheat.agent_wallet;
    return new Response(JSON.stringify({
      accepts: [{
        network: 'testnet',
        asset: 'ALGO',
        amount,
        payTo: wallet,
        resource: url,
        nonce: `${mode}-${isHonest ? 'honest' : 'cheat'}`,
        expiresAt: future(),
      }],
    }), { status: 402, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function rpc(app: ReturnType<typeof makeMcpRoutes>, sessionId: string | null, body: unknown) {
  const headers: Record<string, string> = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const res = await app.request('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    sessionId: res.headers.get('mcp-session-id'),
    body: text ? JSON.parse(text) as Record<string, unknown> : null,
  };
}

async function initMcp(app: ReturnType<typeof makeMcpRoutes>): Promise<string> {
  const initialized = await rpc(app, null, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'router-test', version: '1.0.0' },
    },
  });
  assert.equal(initialized.status, 200);
  assert.ok(initialized.sessionId);
  await rpc(app, initialized.sessionId, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  return initialized.sessionId;
}

async function callTool(
  app: ReturnType<typeof makeMcpRoutes>,
  sessionId: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const out = await rpc(app, sessionId, {
    jsonrpc: '2.0',
    id: randomId(),
    method: 'tools/call',
    params: { name, arguments: args },
  });
  assert.equal(out.status, 200);
  assert.ok(out.body);
  assert.equal(out.body.error, undefined);
  const result = out.body.result as { structuredContent?: Record<string, unknown> };
  assert.ok(result.structuredContent);
  return result.structuredContent;
}

let seq = 0;
function randomId(): number {
  seq += 1;
  return 100 + seq;
}

test('MCP tool list exposes the five Liminal demo tools', async () => {
  const app = makeMcpRoutes(mockCtx());
  const sessionId = await initMcp(app);
  const out = await rpc(app, sessionId, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  assert.equal(out.status, 200);
  const result = out.body?.result as { tools: Array<{ name: string }> };
  assert.deepEqual(result.tools.map((tool) => tool.name).sort(), [
    'liminal_invoke_paid_service',
    'liminal_list_services',
    'liminal_record_payment_proof',
    'liminal_request_payment',
    'liminal_route_task',
  ]);
});

test('MCP route, payment challenge, proof, and paid invocation share router state', async () => {
  const payments = new Map<string, OnChainPayment>();
  const calls = new Map<string, unknown[]>();
  const restore = installMockProviderFetch(calls);
  try {
    const ctx = mockCtx(payments);
    const app = makeMcpRoutes(ctx);
    const sessionId = await initMcp(app);

    const catalog = await callTool(app, sessionId, 'liminal_list_services');
    assert.equal((catalog.services as unknown[]).length, 1);

    const route = await callTool(app, sessionId, 'liminal_route_task', {
      task: 'Run diligence',
      service_id: SERVICE_ID,
    });
    assert.equal(typeof route.route_id, 'string');
    assert.equal(ctx.routeStore.has(route.route_id as string), true);
    const options = route.options as Array<{ option_id: string; name: string; price: number }>;
    assert.equal(options[0].name, 'Cheat Agent');

    const payment = await callTool(app, sessionId, 'liminal_request_payment', {
      route_id: route.route_id,
    });
    assert.equal(typeof payment.sign_url, 'string');
    assert.match(payment.sign_url as string, /\/mcp-sign\?/);
    assert.equal(payment.quote_drift, true);
    assert.equal(payment.amount, 0.06);
    assert.equal(ctx.challengeStore?.size, 1);

    const unpaid = await rpc(app, sessionId, {
      jsonrpc: '2.0',
      id: randomId(),
      method: 'tools/call',
      params: {
        name: 'liminal_invoke_paid_service',
        arguments: { challenge_id: payment.challenge_id },
      },
    });
    assert.equal(unpaid.status, 200);
    const unpaidResult = unpaid.body?.result as { isError?: boolean };
    assert.equal(unpaidResult.isError, true);

    payments.set('paid-cheat', {
      txid: 'paid-cheat',
      sender: PAYER,
      receiver: payment.pay_to as string,
      amount: payment.amount as number,
      asset: payment.asset as string,
      network: payment.network as string,
      note: payment.payment_note as string,
      round: 123,
    });

    const proof = await callTool(app, sessionId, 'liminal_record_payment_proof', {
      challenge_id: payment.challenge_id,
      settlement_txid: 'paid-cheat',
      payer: PAYER,
    });
    assert.equal(proof.accepted, true);
    assert.equal(proof.policy_result, 'quote_drift');

    const invoked = await callTool(app, sessionId, 'liminal_invoke_paid_service', {
      challenge_id: payment.challenge_id,
      payload: { prompt: 'Summarize the diligence finding.' },
    });
    assert.equal(invoked.invoked, true);
    assert.equal(invoked.payment_txid, 'paid-cheat');
    assert.equal((invoked.provider_response as { paid: boolean }).paid, true);

    const paidCalls = calls.get('cheat:paid') ?? [];
    assert.equal(paidCalls.length, 1);
    assert.equal((paidCalls[0] as { payment: string }).payment, 'paid-cheat');
  } finally {
    restore();
  }
});
