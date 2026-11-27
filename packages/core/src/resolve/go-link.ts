import { posix } from 'node:path';
import { ids } from '@catalyst/shared';
import { Model, sourceId } from '../graph/model.js';
import type { SourceFile } from '../scan/scanner.js';
import type { ParsedFile } from '../parse/types.js';

export function goLink(model: Model, files: SourceFile[], parsed: Record<string, ParsedFile>) {
  const goFiles = files.filter((f) => f.language === 'go' && parsed[f.path]);
  const modules = files
    .filter((f) => posix.basename(f.path) === 'go.mod')
    .flatMap((f) => {
      const name = /^module\s+(\S+)/m.exec(f.source)?.[1];
      return name ? [{ name: name.replace(/^"|"$/g, ''), path: posix.dirname(f.path) }] : [];
    })
    .sort((a, b) => b.name.length - a.name.length);
  const byDir = new Map<string, string[]>(),
    definitions = new Map<string, { path: string; id: string }[]>();
  for (const f of goFiles) {
    const dir = posix.dirname(f.path),
      group = byDir.get(dir) ?? [];
    if (!f.path.endsWith('_test.go')) group.push(f.path);
    byDir.set(dir, group);
    for (const s of parsed[f.path]!.symbols) {
      const group = definitions.get(s.name) ?? [];
      group.push({ path: f.path, id: ids.sym(f.path, s.key) });
      definitions.set(s.name, group);
    }
  }
  for (const f of goFiles) {
    const p = parsed[f.path]!,
      dir = posix.dirname(f.path),
      bindings = new Map<string, string[]>();
    for (const imp of p.imports) {
      const mod = modules.find((m) => imp.specifier === m.name || imp.specifier.startsWith(m.name + '/'));
      const path = mod && posix.join(mod.path, imp.specifier.slice(mod.name.length));
      const targets = path ? (byDir.get(path) ?? []) : [];
      const alias = imp.names[0]!.local;
      bindings.set(alias, targets);
      if (mod) {
        for (const file of targets)
          model.edge(ids.file(f.path), ids.file(file), 'imports', f.path, imp.line, 'resolved', 1, {
            names: ['*'],
            specifier: imp.specifier,
          });
      } else {
        const id = ids.pkg('go', imp.specifier);
        model.node(id, imp.specifier, {
          provenance: 'resolved',
          data: { ecosystem: 'go', builtin: !imp.specifier.split('/')[0]!.includes('.') },
        });
        model.edge(ids.file(f.path), id, 'imports', f.path, imp.line, 'resolved', 1, {
          names: ['*'],
          specifier: imp.specifier,
        });
      }
    }
    for (const call of p.calls) {
      const parts = call.calleeText.split('.'),
        name = parts.at(-1)!;
      let candidates = definitions.get(name) ?? [];
      if (parts.length > 1 && bindings.has(parts[0]!)) {
        const scope = bindings.get(parts[0]!)!;
        candidates = candidates.filter((d) => scope.includes(d.path));
      }
      let candidate,
        confidence = 0.6;
      if (candidates.length === 1) candidate = candidates[0];
      else if (candidates.length <= 3) {
        const local = candidates.filter((d) => posix.dirname(d.path) === dir);
        if (local.length === 1) {
          candidate = local[0];
          confidence = 0.4;
        }
      }
      if (candidate)
        model.edge(
          sourceId(f.path, call.callerSymbol),
          candidate.id,
          'calls',
          f.path,
          call.line,
          'heuristic',
          confidence,
        );
    }
  }
}
