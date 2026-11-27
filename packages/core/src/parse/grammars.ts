import Parser from 'web-tree-sitter';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const cache = new Map<string, Promise<Parser>>();
let init: Promise<void> | undefined;
export async function loadGrammars(
  dir = join(dirname(require.resolve('tree-sitter-wasms/package.json')), 'out'),
) {
  await (init ??= Parser.init());
  return {
    async parser(language: string) {
      const grammar = (
        {
          jsx: 'tsx',
          javascript: 'javascript',
          typescript: 'typescript',
          tsx: 'tsx',
          python: 'python',
          go: 'go',
        } as Record<string, string>
      )[language];
      if (!grammar) return null;
      const path = join(dir, 'tree-sitter-' + grammar + '.wasm');
      if (!cache.has(path))
        cache.set(
          path,
          Parser.Language.load(path)
            .then((lang) => {
              const parser = new Parser();
              parser.setLanguage(lang);
              return parser;
            })
            .catch((err) => {
              cache.delete(path);
              throw err;
            }),
        );
      return (await cache.get(path))!;
    },
  };
}
