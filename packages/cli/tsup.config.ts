import { defineConfig } from 'tsup';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  entry: ['src/index.ts', 'src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  splitting: true,
  clean: true,
  shims: true,
  // Some bundled CommonJS dependencies require Node built-ins at runtime.
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as createBundleRequire } from "node:module"; const require = createBundleRequire(import.meta.url);',
  },
  noExternal: [/^@catalyst\//],
  external: ['better-sqlite3', 'web-tree-sitter'],
  esbuildOptions(options) {
    // Resolve the private workspaces at build time. A packed CLI runs independently.
    options.alias = Object.fromEntries(
      ['core', 'server', 'shared'].map((pkg) => [
        '@catalyst/' + pkg,
        fileURLToPath(new URL('../' + pkg + '/src/index.ts', import.meta.url)),
      ]),
    );
  },
});
