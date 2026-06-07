import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

type MutableEnv = Record<string, string | undefined>;

export type LoadDemoEnvOptions = {
  cwd?: string;
  demoFile?: string;
  localFile?: string;
  env?: MutableEnv;
};

function existingEnvKeys(env: MutableEnv): Set<string> {
  return new Set(
    Object.entries(env)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key),
  );
}

function loadEnvFile(
  filename: string,
  env: MutableEnv,
  protectedKeys: Set<string>,
  options: { skipEmptyValues?: boolean } = {},
): void {
  if (!existsSync(filename)) return;

  const parsed = parse(readFileSync(filename));
  for (const [key, value] of Object.entries(parsed)) {
    if (protectedKeys.has(key)) continue;
    if (options.skipEmptyValues && value === '') continue;
    env[key] = value;
  }
}

export function loadDemoEnv(options: LoadDemoEnvOptions = {}): void {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const protectedKeys = existingEnvKeys(env);

  loadEnvFile(resolve(cwd, options.demoFile ?? '.env.demo'), env, protectedKeys);
  loadEnvFile(resolve(cwd, options.localFile ?? '.env'), env, protectedKeys, {
    skipEmptyValues: true,
  });
}
