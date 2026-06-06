// Agent registration routes — the "register a test agent on TestNet" surface.
//
// Reuses the existing ARC-8004 Identity registry interface (register(agentURI, metadata))
// through identity-onchain.ts. Env-gated: with IDENTITY_APP_ID + a funded submitter set,
// registrations mint real NFTs on TestNet; otherwise they return a mock agentId so the
// UI flow still completes (on_chain:false). Mirrors the mock-first pattern of the frontend.
//
// Endpoints:
//   POST /api/agents/register  { name, register?, agent_uri, role?, address?, quote?, asset? }
//   GET  /api/agents
//   POST /api/agents/seed      (gated by ALLOW_SEED=1) — registers the Liminal roster
import { Hono } from 'hono';
import type { Ctx } from './contract.js';
import { registerAgent, onChainAgents } from './identity-onchain.js';
import { registerProvider, providerId } from './providers.js';

const REGISTERS = ['Diligence', 'Outreach', 'Judgment', 'Operations'];
const utf8 = (s: string) => new TextEncoder().encode(s);

// Canonical Liminal roster (liminal-prototype/lib/agency.js). synthesis → Operations (decision D1).
const LIMINAL_ROSTER: Array<{ name: string; register: string; role: string; quote: number }> = [
  { name: 'Operator', register: 'Diligence', role: 'drives the read; proposes the primary hypothesis', quote: 0.10 },
  { name: 'Synthesizer', register: 'Diligence', role: 'fuses the signals into one situation read', quote: 0.09 },
  { name: 'Witness', register: 'Diligence', role: 'reads what is materially/somatically true of an artifact', quote: 0.08 },
  { name: 'Planner', register: 'Outreach', role: 'sequences the outreach steps', quote: 0.07 },
  { name: 'SDR', register: 'Outreach', role: 'drafts the first-touch message', quote: 0.06 },
  { name: 'Strategist', register: 'Operations', role: 'frames the longer-horizon move', quote: 0.12 },
  { name: 'Editor', register: 'Operations', role: 'tightens the artifact before it ships', quote: 0.08 },
  { name: 'Contrarian', register: 'Judgment', role: 'argues the strongest opposing case', quote: 0.11 },
  { name: 'Manager', register: 'Judgment', role: 'calls the verdict and owns the trade-off', quote: 0.13 },
];

interface RegisterBody {
  name?: string;
  register?: string;
  agent_uri?: string;
  role?: string;
  address?: string;   // optional payTo — when present (+quote) the agent is also routable
  quote?: number;
  asset?: string;
}

// in-memory registry of everything registered through this surface (this server run)
interface AgentRow { agent_id: string; name: string; register: string; agent_uri: string; owner: string; tx_id: string; on_chain: boolean; explorer: string | null; }
const agentsList: AgentRow[] = [];
let mockSeq = 0;

export function makeAgentRoutes(ctx: Ctx): Hono {
  const app = new Hono();

  async function doRegister(body: RegisterBody): Promise<AgentRow> {
    const name = (body.name ?? '').trim();
    const register = REGISTERS.includes(body.register ?? '') ? (body.register as string) : 'Diligence';
    const agent_uri = (body.agent_uri ?? '').trim();
    if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
    if (!agent_uri) throw Object.assign(new Error('agent_uri is required'), { status: 400 });

    const metadata: Array<[string, Uint8Array]> = [['name', utf8(name)], ['register', utf8(register)]];
    if (body.role) metadata.push(['role', utf8(body.role)]);

    const pid = body.address ? providerId(ctx.net, body.address.trim()) : undefined;
    const onchain = await registerAgent(ctx, { provider_id: pid, agentURI: agent_uri, metadata });

    // optionally make it routable (only when a payTo address + quote are supplied)
    if (body.address && typeof body.quote === 'number') {
      try {
        registerProvider(ctx, {
          name, register: body.address.trim(), quote: body.quote, asset: body.asset ?? 'ALGO',
          quality: 0.9, dishonest: false, agent_uri,
        });
      } catch (_) { /* duplicate / invalid address → identity-only, non-fatal */ }
    }

    const row: AgentRow = onchain
      ? { agent_id: onchain.agentId, name, register, agent_uri, owner: onchain.owner, tx_id: onchain.txid, on_chain: true, explorer: ctx.deps.explorerFor(onchain.txid) }
      : { agent_id: `mock-${++mockSeq}`, name, register, agent_uri, owner: '(mock)', tx_id: '', on_chain: false, explorer: null };
    agentsList.push(row);
    return row;
  }

  app.post('/api/agents/register', async (c) => {
    const body = await c.req.json<RegisterBody>().catch(() => ({} as RegisterBody));
    try {
      const row = await doRegister(body);
      return c.json({
        agent_id: row.agent_id, tx_id: row.tx_id, app_id: Number(process.env.IDENTITY_APP_ID || 0),
        owner: row.owner, agent_uri: row.agent_uri, register: row.register,
        explorer: row.explorer, on_chain: row.on_chain,
      });
    } catch (e) {
      const err = e as { message?: string };
      return c.json({ error: err.message ?? 'register failed' }, 400);
    }
  });

  app.get('/api/agents', (c) => c.json({
    network: ctx.net,
    app_id: Number(process.env.IDENTITY_APP_ID || 0),
    agents: agentsList,
    seeded_providers: onChainAgents(),   // provider_id → agentId for the on-boot registrations
  }));

  // one-shot dev helper: register the canonical Liminal roster (guarded)
  app.post('/api/agents/seed', async (c) => {
    if (process.env.ALLOW_SEED !== '1') return c.json({ error: 'seeding disabled (set ALLOW_SEED=1)' }, 403);
    const out: AgentRow[] = [];
    for (const a of LIMINAL_ROSTER) {
      out.push(await doRegister({ name: a.name, register: a.register, role: a.role, agent_uri: `https://agents.local/${a.name.toLowerCase()}` }));
    }
    return c.json({ registered: out.length, agents: out });
  });

  return app;
}
