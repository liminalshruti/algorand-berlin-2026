import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AccountBalance, Agent, Ctx } from './contract.js';
import { fundAgents } from './seed.js';

const fundedBalance: AccountBalance = {
  amount: 1.6,
  min_balance: 0.1,
  available: 1.5,
};

const underfundedBalance: AccountBalance = {
  amount: 0.1,
  min_balance: 0.1,
  available: 0,
};

const agent: Agent = {
  id: 'agent-cheat',
  name: 'Cheat Agent',
  agent_uri: 'https://agents.local/cheat',
  agent_wallet: 'CHEATWALLET',
};

function mockCtx(balance: AccountBalance | null): Ctx {
  let settleCount = 0;
  const ctx: Ctx = {
    net: 'testnet',
    store: null,
    session: {
      payer: { addr: 'PAYER', sk: new Uint8Array(64) },
      facilitator: { addr: 'FAC', sk: new Uint8Array(64) },
      funded: { addr: 'PAYER', sk: new Uint8Array(64) },
    },
    agents: new Map([[agent.id, agent]]),
    services: [],
    quoteCache: new Map(),
    activeQuotes: new Map(),
    paymentRequirements: new Map(),
    routeStore: new Map(),
    paymentStore: new Map(),
    repState: { getReputation: () => null },
    ledger: [],
    deps: {
      settle: async () => {
        settleCount++;
        return { txid: `fund-${settleCount}`, round: 1 };
      },
      anchorNote: async () => ({ txid: 'anchor', round: 1 }),
      accountBalance: async () => balance,
      buildReputationEntry: (id, score) => ({ id, score }),
      anchorReputationEntry: async () => 'rep-anchor',
      explorerFor: (txid) => `https://explorer/${txid}`,
    },
  };
  return Object.assign(ctx, {
    settleCount: () => settleCount,
  });
}

test('low-spend smoke mode skips already-funded known-agent wallets', async () => {
  const logs: string[] = [];
  const ctx = mockCtx(fundedBalance);

  const results = await fundAgents(ctx, {
    lowSpendSmoke: true,
    log: (line) => logs.push(line),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].action, 'skipped');
  assert.equal((ctx as Ctx & { settleCount: () => number }).settleCount(), 0);
  assert.match(logs.join('\n'), /funding skipped/);
});

test('low-spend smoke mode aborts instead of funding underfunded wallets', async () => {
  const logs: string[] = [];
  const ctx = mockCtx(underfundedBalance);

  await assert.rejects(
    () => fundAgents(ctx, {
      lowSpendSmoke: true,
      log: (line) => logs.push(line),
    }),
    /abort low-spend smoke/,
  );

  assert.equal((ctx as Ctx & { settleCount: () => number }).settleCount(), 0);
  assert.match(logs.join('\n'), /abort low-spend smoke/);
});

test('normal funding mode tops up underfunded wallets', async () => {
  const logs: string[] = [];
  const ctx = mockCtx(underfundedBalance);

  const results = await fundAgents(ctx, {
    lowSpendSmoke: false,
    log: (line) => logs.push(line),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].action, 'funded');
  assert.equal((ctx as Ctx & { settleCount: () => number }).settleCount(), 1);
  assert.match(logs.join('\n'), /funding required/);
});
