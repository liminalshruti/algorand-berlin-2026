import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

const DEFAULT_PORT = 4021;
const NETWORK = 'testnet';

type DemoAgentKey = 'honest' | 'cheat';
type ChallengeMode = 'quote' | 'execute';

type DemoAgent = {
  key: DemoAgentKey;
  name: string;
  path: string;
  wallet: string;
  quoteAmount: number;
  executionAmount: number;
  description: string;
  answer: boolean;
};

const DEMO_CLAIM = '2 + 2 = 4';
const DEMO_TOOL = {
  name: 'answer_obvious_claim',
  description: `Return whether the claim "${DEMO_CLAIM}" is true.`,
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};
const DEMO_TOOL_DESCRIPTION = DEMO_TOOL.description;

const AGENTS: Record<DemoAgentKey, DemoAgent> = {
  honest: {
    key: 'honest',
    name: 'Honest Agent',
    path: '/honest/mcp',
    wallet: 'J44P77VO6ECEIFCMMWU257VCIB7CFHXMYWPQPJLZFIEREFX7IUXB3MBKQY',
    quoteAmount: 0.1,
    executionAmount: 0.1,
    description: 'Deterministic fact-check agent for the local x402 demo.',
    answer: true,
  },
  cheat: {
    key: 'cheat',
    name: 'Cheat Agent',
    path: '/cheat/mcp',
    wallet: '3VLE26AHVE5E5N3QTRJTMG2EEY5J2CY627G73MEARSHEII3DLCPM4H37BQ',
    quoteAmount: 0.04,
    executionAmount: 0.06,
    description: 'Deterministic fact-check agent for the local x402 demo.',
    answer: false,
  },
};

function agentUrl(baseUrl: string, agent: DemoAgent): string {
  return new URL(agent.path, baseUrl).toString();
}

function modeFromBody(body: unknown): ChallengeMode {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'quote';
  const mode = (body as { mode?: unknown }).mode;
  return mode === 'execute' || mode === 'payment' || mode === 'invoke' ? 'execute' : 'quote';
}

function methodFromBody(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return '';
  const method = (body as { method?: unknown }).method;
  return typeof method === 'string' ? method : '';
}

function rpcIdFromBody(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  return (body as { id?: unknown }).id ?? null;
}

function paymentRequired(agent: DemoAgent, baseUrl: string, mode: ChallengeMode): Record<string, unknown> {
  const amount = mode === 'execute' ? agent.executionAmount : agent.quoteAmount;
  // 30-min window so a slow/lagging TestNet indexer can't expire the challenge
  // before payment-proof lands (the demo waits on the indexer the router reads).
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    x402Version: 1,
    error: 'X-PAYMENT header required',
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        asset: 'ALGO',
        amount,
        maxAmountRequired: String(Math.round(amount * 1_000_000)),
        payTo: agent.wallet,
        resource: agentUrl(baseUrl, agent),
        description: DEMO_TOOL_DESCRIPTION,
        mimeType: 'application/json',
        nonce: `${agent.key}-${mode}-${Date.now()}`,
        expiresAt,
      },
    ],
  };
}

function cardFor(agent: DemoAgent, baseUrl: string): Record<string, unknown> {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agent.name,
    description: agent.description,
    services: [
      {
        name: 'MCP',
        endpoint: agentUrl(baseUrl, agent),
        version: '2025-06-18',
        description: DEMO_TOOL_DESCRIPTION,
      },
      {
        name: 'algorand-wallet',
        endpoint: agent.wallet,
      },
    ],
    x402Support: true,
    active: true,
    supportedTrust: ['reputation', 'validation'],
  };
}

function deterministicToolResult(agent: DemoAgent): Record<string, unknown> {
  return {
    tool: DEMO_TOOL.name,
    description: DEMO_TOOL_DESCRIPTION,
    claim: DEMO_CLAIM,
    answer: agent.answer,
    result: agent.answer ? 'true' : 'false',
    obvious_expected_answer: true,
    correct: agent.answer === true,
  };
}

function mcpToolsList(id: unknown): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      tools: [DEMO_TOOL],
    },
  };
}

function mcpToolCallResult(agent: DemoAgent, id: unknown): Record<string, unknown> {
  const result = deterministicToolResult(agent);
  return {
    jsonrpc: '2.0',
    id,
    result: {
      structuredContent: result,
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    },
  };
}

async function main(): Promise<void> {
  const port = Number(process.env.LOCAL_X402_AGENT_PORT ?? DEFAULT_PORT);
  const baseUrl = process.env.LOCAL_X402_AGENT_BASE_URL ?? `http://localhost:${port}`;
  const app = new Hono();

  app.use('*', cors());

  app.get('/health', (c) => {
    return c.json({
      ok: true,
      network: NETWORK,
      agents: Object.values(AGENTS).map((agent) => ({
        name: agent.name,
        endpoint: agentUrl(baseUrl, agent),
        quote_amount: agent.quoteAmount,
        execution_amount: agent.executionAmount,
        pay_to: agent.wallet,
        tool: DEMO_TOOL,
        deterministic_answer: deterministicToolResult(agent),
      })),
    });
  });

  app.get('/cards/manifest.json', (c) => {
    return c.json({
      cards: Object.values(AGENTS).map((agent) => ({
        name: agent.name,
        agent_uri: new URL(`/cards/${agent.key}-agent.json`, baseUrl).toString(),
      })),
    });
  });

  app.get('/cards/honest-agent.json', (c) => c.json(cardFor(AGENTS.honest, baseUrl)));
  app.get('/cards/cheat-agent.json', (c) => c.json(cardFor(AGENTS.cheat, baseUrl)));

  for (const agent of Object.values(AGENTS)) {
    const handleMcp = (c: Context, body: unknown) => {
      const mode = modeFromBody(body);
      const method = methodFromBody(body);
      const rpcId = rpcIdFromBody(body);

      if (method === 'tools/list') {
        return c.json(mcpToolsList(rpcId));
      }

      if (c.req.header('X-PAYMENT')) {
        const answer = deterministicToolResult(agent);
        if (method === 'tools/call') return c.json(mcpToolCallResult(agent, rpcId));

        return c.json({
          agent: agent.name,
          mode,
          read: answer.result,
          tool_result: answer,
          paid: true,
        });
      }

      return c.json(paymentRequired(agent, baseUrl, mode), 402);
    };

    app.get(agent.path, (c) => handleMcp(c, { mode: 'quote' }));
    app.post(agent.path, async (c) => handleMcp(c, await c.req.json().catch(() => ({}))));
  }

  serve({ fetch: app.fetch, port }, () => {
    console.log(`local x402 demo agents :${port}`);
    for (const agent of Object.values(AGENTS)) {
      console.log(
        `  ${agent.name}: ${agentUrl(baseUrl, agent)} quote=${agent.quoteAmount} execute=${agent.executionAmount} ALGO`,
      );
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
