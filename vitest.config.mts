import typescript from '@rollup/plugin-typescript'
import { puyaTsTransformer } from '@algorandfoundation/algorand-typescript-testing/vitest-transformer'
import { defineConfig } from 'vitest/config'

// Vitest config for the ERC-8004 registry contract unit tests.
// The puyaTsTransformer rewrites Algorand TypeScript constructs (boxes, ops, arc4) into the
// in-process testing runtime, so these run with no Docker / no network.
// Scoped to contracts/ so it does not touch the team's router server or node:test files.
export default defineConfig({
  esbuild: {},
  // algorand-typescript@1.1.0 ships only index.mjs (its `main`/`require` index.js is missing),
  // so force the ESM "import" condition.
  resolve: {
    conditions: ['import', 'module', 'browser', 'default'],
  },
  test: {
    setupFiles: 'vitest.setup.ts',
    include: ['contracts/**/*.spec.ts'],
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      include: ['contracts/**/*.ts'],
      compilerOptions: {
        module: 'esnext',
        moduleResolution: 'bundler',
        noEmit: false,
        noEmitOnError: false,
      },
      transformers: {
        // Default includeExt only matches *.algo.ts / *.algo.spec.ts; widen to all .ts so our
        // lib/*.ts helpers and *.spec.ts tests are transformed too (scoped to contracts/ above).
        before: [puyaTsTransformer({ includeExt: ['.ts'] })],
      },
    }),
  ],
})
