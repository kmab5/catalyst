import { stronglyConnectedComponents } from 'graphology-components';
import ignore from 'ignore';
import { posix } from 'node:path';
import { ids, type FlagDTO, type NodeDTO } from '@catalyst/shared';
import type { Model } from '../graph/model.js';
import type { Linked } from '../resolve/link.js';
import type { ParsedFile } from '../parse/types.js';
import type { SourceFile } from '../scan/scanner.js';
import type { metrics } from './metrics.js';
import { readJson } from '../resolve/ts-resolver.js';
type Graph = ReturnType<typeof metrics>;
export interface HealthOptions {
  disabled?: string[];
  ignore?: string[];
  thresholds?: Record<string, Record<string, number>>;
}
export const DEFAULT_THRESHOLDS = {
  'god-file': { loc: 400, exports: 12, complexity: 60 },
  'god-function': { cc: 15, loc: 80 },
  hub: { minFanIn: 10 },
  'deep-relative-import': { depth: 4 },
  'cross-feature-coupling': { edges: 8, ratio: 0.25 },
};
function cyclePath(graph: Graph['imports'], anchor: string, members: Set<string>) {
  const queue = [anchor],
    parent = new Map<string, string>();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const n of graph.outNeighbors(id).sort()) {
      if (!members.has(n)) continue;
      if (n === anchor && id !== anchor) {
        const path = [id];
        while (path[0] !== anchor) path.unshift(parent.get(path[0]!)!);
        return [...path, anchor];
      }
      if (n !== anchor && !parent.has(n)) {
        parent.set(n, id);
        queue.push(n);
      }
    }
  }
  return [];
}
export function health(
  model: Model,
  g: Graph,
  files: SourceFile[],
  parsed: Record<string, ParsedFile>,
  linked: Linked,
  opts: HealthOptions = {},
) {
  const flags = new Map<string, FlagDTO>();
  const ignored = ignore().add(opts.ignore ?? []);
  const add = (
    rule: string,
    n: NodeDTO,
    severity: FlagDTO['severity'],
    title: string,
    evidence: FlagDTO['evidence'] = {},
  ) => {
    if (opts.disabled?.includes(rule) || (n.filePath && ignored.ignores(n.filePath))) return;
    const id = rule + ':' + n.id;
    flags.set(id, {
      id,
      rule,
      severity,
      node: {
        id: n.id,
        kind: n.kind,
        name: n.name,
        filePath: n.filePath,
        startLine: n.startLine,
        provenance: n.provenance,
      },
      explanation: null,
      title,
      evidence: { metrics: { ...n.metrics }, nodeIds: [n.id], ...evidence },
    });
  };
  const thresholds = <K extends keyof typeof DEFAULT_THRESHOLDS>(k: K) => ({
    ...DEFAULT_THRESHOLDS[k],
    ...opts.thresholds?.[k],
  });
  const heavyFile = thresholds('god-file'),
    heavyFn = thresholds('god-function');
  const fanins = [...model.nodes.values()]
    .filter((n) => n.kind === 'file')
    .map((n) => n.metrics.fan_in ?? 0)
    .sort((a, b) => a - b);
  const hub = Math.max(
    thresholds('hub').minFanIn,
    fanins[Math.max(0, Math.ceil(fanins.length * 0.95) - 1)] ?? 0,
  );
  for (const component of stronglyConnectedComponents(g.imports).filter((c) => c.length > 1)) {
    component.sort(
      (a, b) =>
        model.nodes.get(b)!.metrics.fan_in! - model.nodes.get(a)!.metrics.fan_in! || a.localeCompare(b),
    );
    const anchor = model.nodes.get(component[0]!)!,
      cycle = cyclePath(g.imports, anchor.id, new Set(component));
    add(
      'cycle',
      anchor,
      component.length >= 4 || component.some((id) => g.routeFiles.has(id)) ? 'high' : 'warn',
      component.length +
        ' files import each other in a loop: ' +
        cycle.map((id) => model.nodes.get(id)!.filePath).join(' → ') +
        '. Changing any of them can have surprising effects on the others.',
      { nodeIds: component, cycle },
    );
  }
  const exempt = new Set<string>();
  const entryFiles = new Set<string>();
  function collectEntries(value: unknown, dir: string) {
    if (typeof value === 'string') entryFiles.add(posix.join(dir, value));
    else if (value && typeof value === 'object')
      for (const item of Object.values(value)) collectEntries(item, dir);
  }
  for (const file of files)
    if (posix.basename(file.path) === 'package.json') {
      const config = readJson(file.source);
      for (const value of [config?.main, config?.module, config?.exports])
        collectEntries(value, posix.dirname(file.path));
    }
  for (const file of files)
    if (
      /(?:^|\/)(?:conftest|admin|models)\.py$/.test(file.path) ||
      /if\s+__name__\s*==\s*['"]__main__['"]/.test(file.source)
    )
      exempt.add(file.path);
  for (const n of model.nodes.values()) {
    if (n.filePath && model.nodes.get(ids.file(n.filePath))?.data?.isTest) continue;
    const m = n.metrics;
    if (n.kind === 'file') {
      if (
        m.loc! >= heavyFile.loc &&
        (m.exports! >= heavyFile.exports || m.complexity! >= heavyFile.complexity)
      )
        add(
          'god-file',
          n,
          m.loc! >= 800 ? 'high' : 'warn',
          n.filePath +
            ' is very large (' +
            m.loc +
            ' lines, ' +
            m.exports +
            ' exports) and mixes several jobs. Splitting it would make changes safer.',
        );
      if (m.fan_in! >= hub)
        add(
          'hub',
          n,
          'info',
          m.fan_in + ' files depend on ' + n.filePath + '. Treat changes here as high-impact.',
        );
      for (const imp of parsed[n.filePath!]?.imports ?? []) {
        const depth = (imp.specifier.match(/\.\.\//g) ?? []).length;
        if (depth >= thresholds('deep-relative-import').depth)
          add(
            'deep-relative-import',
            n,
            'info',
            n.filePath +
              ' reaches ' +
              depth +
              ' folders up to import ' +
              imp.specifier +
              '. A path alias would be less fragile.',
            { metrics: { depth, line: imp.line } },
          );
      }
    }
    if (n.kind === 'symbol') {
      if (
        ['function', 'component', 'method', 'hook'].includes(n.symbolKind!) &&
        (m.complexity! >= heavyFn.cc || m.loc! >= heavyFn.loc)
      )
        add(
          'god-function',
          n,
          m.complexity! >= 25 ? 'high' : 'warn',
          n.name +
            ' has complexity ' +
            m.complexity +
            ' across ' +
            m.loc +
            ' lines. Breaking it into smaller functions could make changes easier.',
        );
      const incoming = g.ins.get(n.id) ?? [];
      const convention =
        /(?:^|\/)(?:page|layout|route|loading|error|not-found|template|default|middleware|instrumentation|index|__init__)\.[^/]+$|\.config\.|\.stories\.|(?:^|\/)scripts?\//.test(
          n.filePath!,
        );
      if (
        n.exported &&
        !exempt.has(n.filePath!) &&
        !entryFiles.has(n.filePath!) &&
        !convention &&
        !linked.importedSymbols.has(n.id) &&
        !incoming.some(
          (e) =>
            ['handles', 'calls', 'references', 'renders', 'extends', 'implements'].includes(e.kind) &&
            !(e.filePath && model.nodes.get(ids.file(e.filePath))?.data?.isTest),
        ) &&
        ![
          'metadata',
          'generateMetadata',
          'generateStaticParams',
          'revalidate',
          'dynamic',
          'config',
          'runtime',
        ].includes(n.name)
      )
        add(
          'unused-export',
          n,
          m.loc! >= 30 ? 'warn' : 'info',
          n.name + ' is exported but nothing in the project uses it. It may be dead code.',
        );
      if (
        !entryFiles.has(n.filePath!) &&
        (n.symbolKind === 'interface' || /abstract class|\b(?:ABC|Protocol)\b/.test(n.signature ?? ''))
      ) {
        const impl = incoming.filter((e) => e.kind === 'extends' || e.kind === 'implements');
        if (impl.length === 1)
          add(
            'single-impl-interface',
            n,
            'info',
            n.name +
              ' has only one implementation (' +
              model.nodes.get(impl[0]!.src)?.name +
              '). The extra layer may not be needed yet.',
            { nodeIds: [n.id, impl[0]!.src] },
          );
      }
      const sym = parsed[n.filePath!]?.symbols.find((s) => s.startLine === n.startLine && s.name === n.name);
      if (sym?.passThrough) {
        const call = g.outs.get(n.id)?.find((e) => e.kind === 'calls' && e.provenance !== 'heuristic');
        if (call)
          add(
            'pass-through-wrapper',
            n,
            'info',
            n.name +
              ' only forwards its arguments to ' +
              sym.passThrough +
              '. Calling it directly would be simpler.',
            { nodeIds: [n.id, call.dst] },
          );
      }
    }
    if (n.kind === 'route' && ['POST', 'PUT', 'PATCH', 'DELETE', 'ANY'].includes(String(n.data?.method))) {
      const visited = new Set([n.id]),
        queue = [{ id: n.id, d: 0 }],
        writes = new Set<string>();
      const matcher = model.nodes.get(ids.route('MIDDLEWARE', '*'))?.data?.matcher;
      const route = String(n.data?.path);
      let auth =
        Array.isArray(matcher) &&
        matcher.some((pattern) => {
          if (typeof pattern !== 'string') return false;
          if (pattern === route) return true;
          const prefix = pattern.match(/^(.*)\/:\w+\*$/)?.[1];
          return prefix !== undefined && (route === prefix || route.startsWith(prefix + '/'));
        });
      for (let i = 0; i < queue.length; i++) {
        const { id, d } = queue[i]!,
          node = model.nodes.get(id)!;
        if (
          /(?:get|require|check|verify|ensure)(?:User|Session|Auth|Admin)|auth|current_user/i.test(
            node.name,
          ) ||
          node.data?.category === 'auth'
        )
          auth = true;
        if (d >= 4) continue;
        for (const e of g.outs.get(id) ?? []) {
          if (e.kind === 'writes') writes.add(e.dst);
          if (['handles', 'calls', 'calls_service'].includes(e.kind) && !visited.has(e.dst)) {
            visited.add(e.dst);
            queue.push({ id: e.dst, d: d + 1 });
          }
        }
      }
      if (writes.size && !auth)
        add(
          'missing-auth-on-mutating-route',
          n,
          'high',
          n.name +
            ' changes data and no login or permission check was found on its path. Confirm it is meant to be public.',
          { nodeIds: [...visited, ...writes] },
        );
    }
  }
  return [...flags.values()];
}
