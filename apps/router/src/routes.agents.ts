// Agent routes — identity discovery plus service/quote routing.
import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import type { Ctx } from './contract.js';
import { registerAgent, registryAgentIdFor } from './identity-onchain.js';
import {
  DEFAULT_REPUTATION,
  DEFAULT_SERVICE_ID,
  agentId,
  agentRow,
  buildServicesCatalog,
  candidateFor,
  discoverServices,
  discoveryOptions,
  registerAgentLocal,
  registerServiceLocal,
} from './agents.js';

const utf8 = (s: string) => new TextEncoder().encode(s);

interface RegisterBody {
  name?: string;
  agent_uri?: string;
  address?: string;
}

type RouteBody = {
  task?: string;
  service_id?: string;
};

export function makeAgentRoutes(ctx: Ctx): Hono {
  const app = new Hono();

  async function doRegister(body: RegisterBody) {
    const name = (body.name ?? '').trim();
    const agent_uri = (body.agent_uri ?? '').trim();
    const wallet = (body.address ?? '').trim();
    if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
    if (!agent_uri) throw Object.assign(new Error('agent_uri is required'), { status: 400 });
    if (!wallet) throw Object.assign(new Error('address is required'), { status: 400 });

    const id = agentId(ctx.net, wallet);
    const onchain = await registerAgent(ctx, {
      agent_id: id,
      agentURI: agent_uri,
      metadata: [['name', utf8(name)]],
      agentWallet: wallet,
    });

    const local = registerAgentLocal(ctx, {
      id,
      name,
      agent_uri,
      agent_wallet: wallet,
    });
    registerServiceLocal(ctx, {
      service_id: DEFAULT_SERVICE_ID,
      agent_id: local.id,
      protocol: 'MCP',
      endpoint: `${agent_uri.replace(/\/$/, '')}/mcp`,
      name: 'Diligence report',
      quote: 0.1,
      source: 'manual',
    });

    return {
      agent_id: local.id,
      registry_agent_id: onchain?.registryAgentId ?? null,
      tx_id: onchain?.txid ?? '',
      wallet_tx_id: onchain?.walletTxid ?? '',
      wallet_set_error: onchain?.walletSetError ?? '',
      app_id: Number(process.env.IDENTITY_APP_ID || 0),
      owner: onchain?.owner ?? '(local)',
      agent_wallet: local.agent_wallet,
      agent_uri: local.agent_uri,
      explorer: onchain ? ctx.deps.explorerFor(onchain.txid) : null,
      wallet_explorer: onchain?.walletTxid ? ctx.deps.explorerFor(onchain.walletTxid) : null,
      on_chain: Boolean(onchain),
    };
  }

  app.get('/api/agents', (c) => {
    const agents = [...ctx.agents.values()].map((agent) => {
      const services = ctx.services.filter((service) => service.agent_id === agent.id);
      return agentRow(agent, services, registryAgentIdFor(agent.id) ?? undefined);
    });
    return c.json({
      network: ctx.net,
      app_id: Number(process.env.IDENTITY_APP_ID || 0),
      agents,
    });
  });

  app.get('/api/services', async (c) => {
    return c.json(await buildServicesCatalog(ctx, registryAgentIdFor));
  });

  app.post('/api/route', async (c) => {
    const body: RouteBody = await c.req.json<RouteBody>().catch(() => ({}));
    const service_id = body.service_id ?? DEFAULT_SERVICE_ID;
    const task = body.task ?? '';
    const services = discoverServices(ctx, service_id);

    const candidates = (await Promise.all(services
      .map(async (service) => {
        const agent = ctx.agents.get(service.agent_id);
        if (!agent) return null;
        const rep = ctx.repState.getReputation(agent.id);
        if (rep !== null && rep.score <= 0) return null;
        return candidateFor(ctx, agent, service, rep?.score ?? DEFAULT_REPUTATION, task).catch(() => null);
      })
    )).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

    if (candidates.length === 0) {
      return c.json({ error: `No agents for service: ${service_id}` }, 400);
    }

    const route_id = randomUUID();
    const options = discoveryOptions(candidates);

    ctx.routeStore.set(route_id, { route_id, task, service_id, options });

    return c.json({
      route_id,
      task,
      service_id,
      options,
    });
  });

  app.post('/api/agents/register', async (c) => {
    const body = await c.req.json<RegisterBody>().catch(() => ({} as RegisterBody));
    try {
      return c.json(await doRegister(body));
    } catch (e) {
      const err = e as { message?: string };
      return c.json({ error: err.message ?? 'register failed' }, 400);
    }
  });

  return app;
}
