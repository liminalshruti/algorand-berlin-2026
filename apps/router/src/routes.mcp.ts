// MCP facade — exposes the trust router as a Claude Code-compatible tool server.
import { randomUUID } from 'crypto';
import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import * as z from 'zod/v4';
import type { Ctx } from './contract.js';
import { buildServicesCatalog } from './agents.js';
import { registryAgentIdFor } from './identity-onchain.js';
import { createRoute } from './routes.agents.js';
import {
  acceptPaymentProofForChallenge,
  createPaymentChallenge,
  getPaymentChallenge,
} from './routes.trust.js';

type McpSession = {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : {};
}

function toolResult(value: unknown) {
  const structuredContent = asRecord(value);
  return {
    structuredContent,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function fail(message: string): never {
  throw new Error(message);
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function routerBaseUrl(): string {
  return cleanBaseUrl(process.env.ROUTER_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`);
}

function signUrlFor(challenge_id: string): string {
  const webBase = cleanBaseUrl(process.env.WEB_BASE_URL ?? 'http://localhost:3000');
  const params = new URLSearchParams({
    challenge_id,
    api_base: routerBaseUrl(),
  });
  return `${webBase}/mcp-sign?${params.toString()}`;
}

function routeOptionFor(ctx: Ctx, route_id: string, option_id?: string): string {
  const route = ctx.routeStore.get(route_id);
  if (!route) fail('unknown route_id');
  const selected = option_id?.trim() || route.options[0]?.option_id;
  if (!selected) fail('route has no options');
  if (!route.options.some((option) => option.option_id === selected)) fail('unknown option_id');
  return selected;
}

function parseProviderBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function invokePaidService(
  ctx: Ctx,
  challenge_id: string,
  payload: JsonRecord = {},
): Promise<JsonRecord> {
  const challenge = getPaymentChallenge(ctx, challenge_id);
  if (!challenge) fail('unknown challenge_id');
  if (!challenge.payment_txid) fail('challenge has no accepted payment proof');

  const agent = ctx.agents.get(challenge.agent_id);
  if (!agent) fail('unknown agent_id');

  const service = ctx.services.find((candidate) => {
    return candidate.agent_id === challenge.agent_id && candidate.service_id === challenge.service_id;
  });
  if (!service) fail('unknown service for challenge');

  const res = await fetch(service.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-PAYMENT': challenge.payment_txid,
    },
    body: JSON.stringify({
      ...payload,
      mode: 'execute',
      challenge_id,
      route_id: challenge.route_id,
      option_id: challenge.option_id,
    }),
  });
  const provider_response = parseProviderBody(await res.text());
  if (!res.ok) {
    fail(`provider invocation failed: ${res.status}`);
  }

  return {
    invoked: true,
    challenge_id,
    route_id: challenge.route_id,
    option_id: challenge.option_id,
    agent_id: challenge.agent_id,
    agent: {
      name: agent.name,
      agent_uri: agent.agent_uri,
      agent_wallet: agent.agent_wallet,
    },
    service_id: challenge.service_id,
    endpoint: service.endpoint,
    payment_txid: challenge.payment_txid,
    payer: challenge.payer ?? '',
    quote_drift: challenge.quote_drift,
    provider_status: res.status,
    provider_response,
  };
}

function makeLiminalMcpServer(ctx: Ctx): McpServer {
  const server = new McpServer({
    name: 'liminal-trust-router',
    version: '1.0.0',
  });

  server.registerTool(
    'liminal_list_services',
    {
      title: 'List Liminal Services',
      description: 'List trust-routed services and provider options discovered by the x402 trust router.',
    },
    async () => toolResult(await buildServicesCatalog(ctx, registryAgentIdFor)),
  );

  server.registerTool(
    'liminal_route_task',
    {
      title: 'Route Task',
      description: 'Create a ranked trust route for a task and service id.',
      inputSchema: {
        task: z.string().describe('Task the routed agent should perform.'),
        service_id: z.string().optional().describe('Service id from liminal_list_services, defaults to diligence.report.'),
      },
    },
    async ({ task, service_id }) => {
      return toolResult(await createRoute(ctx, { task, service_id }));
    },
  );

  server.registerTool(
    'liminal_request_payment',
    {
      title: 'Request x402 Payment',
      description: 'Create an x402 payment challenge for a route option and return the Pera signing URL.',
      inputSchema: {
        route_id: z.string().describe('Route id returned by liminal_route_task.'),
        option_id: z.string().optional().describe('Route option id; defaults to the top-ranked option.'),
      },
    },
    async ({ route_id, option_id }) => {
      const selectedOption = routeOptionFor(ctx, route_id, option_id);
      const { challenge, payload } = await createPaymentChallenge(ctx, route_id, selectedOption);
      return toolResult({
        ...payload,
        sign_url: signUrlFor(challenge.challenge_id),
        next_step: 'Open sign_url, connect Pera on TestNet, sign the payment, then call liminal_record_payment_proof with the returned txid and payer.',
      });
    },
  );

  server.registerTool(
    'liminal_record_payment_proof',
    {
      title: 'Record Payment Proof',
      description: 'Verify a TestNet settlement txid against an existing x402 challenge.',
      inputSchema: {
        challenge_id: z.string().describe('Challenge id from liminal_request_payment.'),
        settlement_txid: z.string().describe('Algorand TestNet payment txid.'),
        payer: z.string().describe('Payer wallet address that signed the settlement.'),
      },
    },
    async ({ challenge_id, settlement_txid, payer }) => {
      return toolResult(await acceptPaymentProofForChallenge(ctx, challenge_id, settlement_txid, payer));
    },
  );

  server.registerTool(
    'liminal_invoke_paid_service',
    {
      title: 'Invoke Paid Service',
      description: 'Forward a paid, proof-verified challenge to the selected provider MCP endpoint.',
      inputSchema: {
        challenge_id: z.string().describe('Challenge id with an accepted payment proof.'),
        payload: z.record(z.string(), z.unknown()).optional().describe('Optional provider payload.'),
      },
    },
    async ({ challenge_id, payload }) => {
      return toolResult(await invokePaidService(ctx, challenge_id, payload ?? {}));
    },
  );

  return server;
}

export function makeMcpRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  const sessions = new Map<string, McpSession>();

  app.all('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');
    let session = sessionId ? sessions.get(sessionId) : undefined;

    if (!session) {
      const server = makeLiminalMcpServer(ctx);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          sessions.set(id, { server, transport });
        },
        onsessionclosed: (id) => {
          const closing = sessions.get(id);
          sessions.delete(id);
          void closing?.server.close();
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
        void server.close();
      };
      await server.connect(transport);
      session = { server, transport };
    }

    return session.transport.handleRequest(c.req.raw);
  });

  return app;
}
