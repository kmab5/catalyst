import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      ['core', 'server', 'shared'].map((name) => [
        '@catalyst/' + name,
        fileURLToPath(new URL('../' + name + '/src/index.ts', import.meta.url)),
      ]),
    ),
  },
});
