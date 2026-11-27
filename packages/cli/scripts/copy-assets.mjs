import { cp, copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const web = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const grammars = join(dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');
await cp(web, join(dist, 'web'), { recursive: true });
await mkdir(join(dist, 'grammars'), { recursive: true });
await Promise.all(
  ['typescript', 'tsx', 'javascript', 'python', 'go'].map((language) => {
    const file = 'tree-sitter-' + language + '.wasm';
    return copyFile(join(grammars, file), join(dist, 'grammars', file));
  }),
);
