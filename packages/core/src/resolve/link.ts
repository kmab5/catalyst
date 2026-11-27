import { ids, type EdgeKind, type Provenance } from '@catalyst/shared';
import { Model, sourceId } from '../graph/model.js';
import type { ParsedFile } from '../parse/types.js';
import type { SourceFile } from '../scan/scanner.js';
import { TsResolver, readJson } from './ts-resolver.js';
import { PyResolver } from './py-resolver.js';
import { goLink } from './go-link.js';

export type Binding = { kind: 'symbol' | 'package' | 'module'; id: string };
export function link(model: Model, files: SourceFile[], parsed: Record<string, ParsedFile>) {
  const paths = new Set(files.map((f) => f.path));
  const sources = new Map(files.map((f) => [f.path, f]));
  const ts = new TsResolver(paths, (p) => readJson(sources.get(p)?.source ?? ''));
  const py = new PyResolver(paths);
  const exports = new Map(Object.values(parsed).map((p) => [p.path, p.exports]));
  const byName = new Map<string, string[]>(),
    methods = new Map<string, string[]>();
  const bindings = new Map<string, Map<string, Binding>>();
  const importedSymbols = new Set<string>();
  const unresolved: { file: string; specifier: string }[] = [];
  const local = new Map<string, Map<string, string>>();
  const family = (path: string) => {
    const language = sources.get(path)?.language;
    return language === 'python' || language === 'go' ? language : 'javascript';
  };
  for (const p of Object.values(parsed)) {
    const names = new Map<string, string>();
    local.set(p.path, names);
    for (const s of p.symbols) {
      const id = ids.sym(p.path, s.key);
      names.set(s.key, id);
      if (s.symbolKind !== 'method' && !names.has(s.name)) names.set(s.name, id);
      model.node(id, s.name, {
        filePath: p.path,
        startLine: s.startLine,
        endLine: s.endLine,
        signature: s.signature,
        symbolKind: s.symbolKind,
        tier: sources.get(p.path)!.tier,
        exported: s.exported,
        metrics: { loc: s.loc, complexity: p.complexity[s.key] ?? 0 },
        data: { serverAction: p.directives.includes('use server') && s.exported },
      });
      model.edge(
        s.parentName ? ids.sym(p.path, s.parentName) : ids.file(p.path),
        id,
        'contains',
        p.path,
        s.startLine,
      );
      if (s.exported) {
        const name = family(p.path) + ':' + s.name;
        const arr = byName.get(name) ?? [];
        arr.push(id);
        byName.set(name, arr);
      }
      if (s.symbolKind === 'method') {
        const name = family(p.path) + ':' + s.name;
        const arr = methods.get(name) ?? [];
        arr.push(id);
        methods.set(name, arr);
      }
    }
  }
  for (const p of Object.values(parsed)) {
    const map = new Map<string, Binding>();
    bindings.set(p.path, map);
    if (sources.get(p.path)?.language === 'go') continue;
    const imports = new Set<string>();
    const isPy = sources.get(p.path)?.language === 'python';
    const allImports = [
      ...p.imports,
      ...p.exports
        .filter((e) => e.specifier)
        .map((e) => ({
          specifier: e.specifier!,
          names: [{ imported: e.local, local: e.exported }],
          isTypeOnly: false,
          line: 1,
        })),
    ];
    for (const imp of allImports) {
      const names = imp.names.length ? imp.names : [{ imported: '', local: '' }];
      for (const { imported, local: alias } of names) {
        const r = isPy
          ? py.resolve(p.path, imp.specifier, imported && imported !== '*' ? imported : undefined)
          : ts.resolve(p.path, imp.specifier);
        if (r.kind === 'unresolved') {
          unresolved.push({ file: p.path, specifier: imp.specifier });
          continue;
        }
        let dst: string;
        if (r.kind === 'package') {
          dst = ids.pkg(isPy ? 'pypi' : 'npm', r.name);
          model.node(dst, r.name, {
            data: { builtin: 'builtin' in r ? r.builtin : r.stdlib, ecosystem: isPy ? 'pypi' : 'npm' },
            provenance: 'resolved',
          });
          if (alias) map.set(alias, { kind: 'package', id: dst });
        } else {
          dst = ids.file(r.path);
          imports.add(r.path);
          const def = isPy
            ? 'symbol' in r && typeof r.symbol === 'string'
              ? { file: r.path, name: r.symbol }
              : null
            : ts.resolveBinding(p.path, imp.specifier, imported, exports);
          const id = def ? local.get(def.file)?.get(def.name) : undefined;
          if (alias) map.set(alias, id ? { kind: 'symbol', id } : { kind: 'module', id: dst });
          if (id && !model.nodes.get(ids.file(p.path))?.data?.isTest) importedSymbols.add(id);
        }
        model.edge(ids.file(p.path), dst, 'imports', p.path, imp.line, 'resolved', 1, {
          names: imported ? [imported] : [],
          typeOnly: imp.isTypeOnly,
          specifier: imp.specifier,
        });
      }
    }
    const scopes = new Map(p.symbols.map((s) => [s.key, new Set(s.localNames)]));
    const resolve = (caller: string, name: string, kind: EdgeKind, line: number) => {
      const [first, member, ...tail] = name.split('.');
      if (!first || tail.length || (first !== 'self' && scopes.get(caller)?.has(first))) return;
      let dst: string | undefined,
        provenance: Provenance = 'ast',
        confidence = 1;
      const binding = map.get(first);
      if (!member) dst = local.get(p.path)?.get(first);
      if (!dst && binding) {
        provenance = 'resolved';
        if (binding.kind === 'package') return;
        if (!member && binding.kind === 'symbol') dst = binding.id;
        if (member && binding.kind === 'module') dst = local.get(ids.parse(binding.id).path!)?.get(member);
      } else if (member && ['this', 'self'].includes(first)) {
        dst = local.get(p.path)?.get(caller.split('.')[0] + '.' + member);
        confidence = 0.9;
      }
      if (!dst && member) {
        const matches = methods.get(family(p.path) + ':' + member);
        if (matches?.length === 1 && imports.has(ids.parse(matches[0]!).path!)) {
          dst = matches[0];
          provenance = 'heuristic';
          confidence = 0.6;
        }
      }
      if (!dst && !member && !binding) {
        const matches = byName.get(family(p.path) + ':' + first);
        if (matches?.length === 1) {
          dst = matches[0];
          provenance = 'heuristic';
          confidence = 0.5;
        }
      }
      if (dst) model.edge(sourceId(p.path, caller), dst, kind, p.path, line, provenance, confidence);
    };
    for (const c of p.calls) resolve(c.callerSymbol, c.calleeText, 'calls', c.line);
    for (const j of p.jsx) resolve(j.callerSymbol, j.name, 'renders', j.line);
    for (const ref of p.refs) resolve(ref.callerSymbol, ref.name, ref.kind, ref.line);
  }
  goLink(model, files, parsed);
  return { bindings, unresolved, importedSymbols, local };
}
export type Linked = ReturnType<typeof link>;
