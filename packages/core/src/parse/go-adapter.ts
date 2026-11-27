import type Parser from 'web-tree-sitter';
import type { LanguageAdapter, RawSymbol } from './types.js';
import { emptyParsedFile } from './types.js';

// Capture declarations and references separately so a name match cannot be mistaken for a binding.
const tags = [
  '(function_declaration) @definition.function',
  '(method_declaration) @definition.method',
  '(type_spec) @definition.type',
  '(call_expression) @reference.call',
  '(import_spec) @import',
].join('\n');
const queries = new WeakMap<Parser.Language, Parser.Query>();

export const goAdapter: LanguageAdapter = {
  languages: ['go'],
  parse({ parser, path, source }) {
    const tree = parser.parse(source),
      file = emptyParsedFile(path);
    try {
      const language = parser.getLanguage();
      let query = queries.get(language);
      if (!query) {
        query = language.query(tags);
        queries.set(language, query);
      }
      const declarations = new Map<number, RawSymbol>(),
        keys = new Set<string>();
      for (const { name: tag, node } of query.captures(tree.rootNode)) {
        const line = node.startPosition.row + 1;
        if (tag.startsWith('definition.')) {
          const name = node.childForFieldName('name')?.text;
          if (!name) continue;
          const body = node.childForFieldName('body'),
            receiver = node.childForFieldName('receiver');
          const owner = receiver?.descendantsOfType('type_identifier')[0]?.text;
          const kind = tag.slice('definition.'.length);
          const base = owner ? owner + '.' + name : name,
            key = keys.has(base) ? base + '@' + line : base;
          keys.add(key);
          const s: RawSymbol = {
            name,
            key,
            symbolKind: kind,
            startLine: line,
            endLine: node.endPosition.row + 1,
            exported: /^\p{Lu}/u.test(name),
            isDefault: false,
            signature: source
              .slice(node.startIndex, body?.startIndex ?? node.endIndex)
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 160),
            loc: node.text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length,
          };
          if (body)
            file.complexity[key] =
              1 +
              body.descendantsOfType([
                'if_statement',
                'for_statement',
                'expression_case',
                'communication_case',
              ]).length;
          file.symbols.push(s);
          declarations.set(node.id, s);
        } else if (tag === 'import') {
          const path = node.childForFieldName('path')?.text.slice(1, -1);
          if (!path) continue;
          const local = node.childForFieldName('name')?.text ?? path.split('/').at(-1)!;
          file.imports.push({
            specifier: path,
            names: [{ local, imported: '*' }],
            isNamespace: true,
            isDefault: false,
            isDynamic: false,
            isTypeOnly: false,
            line,
          });
        } else {
          const fn = node.childForFieldName('function');
          if (!fn) continue;
          let parent = node.parent,
            callerSymbol = '<module>';
          while (parent) {
            const symbol = declarations.get(parent.id);
            if (symbol) {
              callerSymbol = symbol.key;
              break;
            }
            parent = parent.parent;
          }
          const args =
            node.childForFieldName('arguments')?.namedChildren.map((n) => n.text.slice(0, 1500)) ?? [];
          file.calls.push({
            calleeText: fn.text,
            callerSymbol,
            args,
            argsCount: args.length,
            line,
            guarded: false,
          });
        }
      }
      const top = tree.rootNode.namedChildren;
      file.partial = top.filter((n) => n.hasError).length > top.length * 0.2;
      return file;
    } finally {
      tree.delete();
    }
  },
};
