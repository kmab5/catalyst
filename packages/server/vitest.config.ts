import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Exercise workspace sources even on a fresh checkout with no build output.
export default defineConfig({
  resolve: { alias: {
    '@catalyst/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    '@catalyst/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
  } },
});
