import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoEnv } from './env.js';

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'router-env-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('loadDemoEnv loads .env.demo, then non-empty .env overrides', async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, '.env.demo'), [
      'ALGO_NETWORK=testnet',
      'PORT=3001',
      'PAYER_MNEMONIC=demo-payer',
    ].join('\n'));
    await writeFile(join(dir, '.env'), [
      'ALGO_NETWORK=localnet',
      'PAYER_MNEMONIC=local-payer',
    ].join('\n'));

    const env: Record<string, string | undefined> = {};
    loadDemoEnv({ cwd: dir, env });

    assert.equal(env.ALGO_NETWORK, 'localnet');
    assert.equal(env.PORT, '3001');
    assert.equal(env.PAYER_MNEMONIC, 'local-payer');
  });
});

test('loadDemoEnv keeps real shell env ahead of both env files', async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, '.env.demo'), 'PORT=3001\nALGO_NETWORK=testnet\n');
    await writeFile(join(dir, '.env'), 'PORT=3002\nALGO_NETWORK=localnet\n');

    const env: Record<string, string | undefined> = { PORT: '9999' };
    loadDemoEnv({ cwd: dir, env });

    assert.equal(env.PORT, '9999');
    assert.equal(env.ALGO_NETWORK, 'localnet');
  });
});

test('loadDemoEnv ignores blank local overrides so copied examples do not erase demo values', async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, '.env.demo'), 'PAYER_MNEMONIC=demo-payer\nALGOD_TOKEN=\n');
    await writeFile(join(dir, '.env'), 'PAYER_MNEMONIC=\n');

    const env: Record<string, string | undefined> = {};
    loadDemoEnv({ cwd: dir, env });

    assert.equal(env.PAYER_MNEMONIC, 'demo-payer');
    assert.equal(env.ALGOD_TOKEN, '');
  });
});
