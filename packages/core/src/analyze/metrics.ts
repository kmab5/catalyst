import { DirectedGraph, UndirectedGraph } from 'graphology';
import louvain from 'graphology-communities-louvain';
import { posix } from 'node:path';
import { ids } from '@catalyst/shared';
import { Model, type AnalysisEdge } from '../graph/model.js';
export interface MetricsGraph {
  imports: DirectedGraph;
  ins: Map<string, AnalysisEdge[]>;
  outs: Map<string, AnalysisEdge[]>;
  routeFiles: Set<string>;
}
export function metrics(model: Model): MetricsGraph {
  const imports = new DirectedGraph(),
    communities = new UndirectedGraph();
  const incoming = new Map<string, Set<string>>(),
    outgoing = new Map<string, Set<string>>(),
    pkgs = new Map<string, Set<string>>();
  const outs = new Map<string, AnalysisEdge[]>(),
    ins = new Map<string, AnalysisEdge[]>();
  const dirs = new Map<string, string[]>();
  const group = (m: Map<string, Set<string>>, id: string, other: string) => {
    const s = m.get(id) ?? new Set();
    s.add(other);
    m.set(id, s);
  };
  for (const n of model.nodes.values())
    if (n.kind === 'file') {
      if (!n.data?.isTest) imports.addNode(n.id);
      if (n.tier && !n.data?.isTest) communities.addNode(n.id);
      const parents: string[] = [];
      let dirname = posix.dirname(n.filePath!);
      for (;;) {
        const id = ids.dir(dirname === '.' ? '' : dirname);
        parents.push(id);
        const parent = model.nodes.get(id);
        if (parent) parent.metrics.loc = (parent.metrics.loc ?? 0) + (n.metrics.loc ?? 0);
        if (dirname === '.') break;
        dirname = posix.dirname(dirname);
      }
      dirs.set(n.id, parents);
      Object.assign(n.metrics, { complexity: 0, complexity_max: 0, exports: 0, symbols: 0, depth: -1 });
    }
  function weight(a: string, b: string, w: number) {
    if (a === b || !communities.hasNode(a) || !communities.hasNode(b)) return;
    if (communities.hasEdge(a, b)) communities.updateEdgeAttribute(a, b, 'weight', (v) => v + w);
    else communities.addEdge(a, b, { weight: w });
  }
  for (const e of model.edges.values()) {
    const src = model.nodes.get(e.src),
      dst = model.nodes.get(e.dst);
    if (!src || !dst) continue;
    const out = outs.get(e.src) ?? [],
      inc = ins.get(e.dst) ?? [];
    out.push(e);
    inc.push(e);
    outs.set(e.src, out);
    ins.set(e.dst, inc);
    if (
      e.data.typeOnly ||
      src.data?.isTest ||
      (src.filePath && model.nodes.get(ids.file(src.filePath))?.data?.isTest)
    )
      continue;
    if (e.kind === 'imports') {
      if (dst.kind === 'package') group(pkgs, e.src, e.dst);
      else if (imports.hasNode(e.src) && imports.hasNode(e.dst)) {
        imports.mergeEdge(e.src, e.dst);
        weight(e.src, e.dst, 1);
        group(incoming, e.dst, e.src);
        group(outgoing, e.src, e.dst);
        for (const id of dirs.get(e.src) ?? [])
          if (!dirs.get(e.dst)?.includes(id)) group(outgoing, id, e.dst);
        for (const id of dirs.get(e.dst) ?? [])
          if (!dirs.get(e.src)?.includes(id)) group(incoming, id, e.src);
      }
    } else if (
      ['calls', 'references', 'renders', 'extends', 'implements'].includes(e.kind) &&
      src.kind === 'symbol' &&
      dst.kind === 'symbol'
    ) {
      group(incoming, e.dst, e.src);
      group(outgoing, e.src, e.dst);
      if (e.kind === 'calls' || e.kind === 'renders')
        weight(ids.file(src.filePath!), ids.file(dst.filePath!), Math.min(5, Number(e.data.count ?? 1)));
    }
  }
  for (const n of model.nodes.values()) {
    if (!['symbol', 'file', 'directory'].includes(n.kind)) continue;
    const fi = incoming.get(n.id)?.size ?? 0,
      fo = outgoing.get(n.id)?.size ?? 0;
    Object.assign(n.metrics, { fan_in: fi, fan_out: fo, instability: fi + fo ? fo / (fi + fo) : 0 });
    if (n.kind === 'file') n.metrics.fan_out_pkg = pkgs.get(n.id)?.size ?? 0;
    else if (n.kind === 'symbol') {
      const parent = model.nodes.get(ids.file(n.filePath!))!.metrics;
      parent.symbols = (parent.symbols ?? 0) + 1;
      parent.exports = (parent.exports ?? 0) + Number(n.exported);
      parent.complexity = (parent.complexity ?? 0) + (n.metrics.complexity ?? 0);
      parent.complexity_max = Math.max(parent.complexity_max ?? 0, n.metrics.complexity ?? 0);
    }
  }
  const routeFiles = new Set(
    [...model.nodes.values()]
      .filter((n) => n.kind === 'route' && n.filePath)
      .map((n) => ids.file(n.filePath!)),
  );
  let frontier = new Set(routeFiles);
  for (let d = 0; d <= 20 && frontier.size; d++) {
    const next = new Set<string>();
    for (const id of frontier) {
      const n = model.nodes.get(id);
      if (!n) continue;
      n.metrics.depth = d;
      if (imports.hasNode(id))
        for (const other of imports.outNeighbors(id)) if (!routeFiles.has(other)) next.add(other);
    }
    frontier = next;
  }
  let seed = 42;
  const mapping = louvain(communities, {
    rng: () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296,
  });
  for (const [id, value] of Object.entries(mapping)) model.nodes.get(id)!.metrics.community = value;
  return { imports, ins, outs, routeFiles };
}
