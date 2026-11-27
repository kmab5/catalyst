import type {
  EdgeKind,
  NodeDTO,
  FlagDTO,
  Provenance,
  NodeRef,
  Feature,
  Lang,
  FileSummary,
  ModuleSummary,
} from '@catalyst/shared';
import type { Store } from '../store/index.js';
import { CatalystError } from '../errors.js';

export type Edge = {
  src: string;
  dst: string;
  kind: EdgeKind;
  provenance: Provenance;
  confidence: number;
  filePath: string | null;
  line: number | null;
  data?: { typeOnly?: boolean; names?: string[] };
};
export function ref(n: NodeDTO): NodeRef {
  const { id, name, kind, filePath, startLine, provenance } = n;
  return { id, name, kind, filePath, startLine, provenance };
}
export function catalog(store: Store) {
  const rows = store.all<
    Omit<NodeDTO, 'data' | 'exported' | 'metrics'> & { data: string | null; exported: number }
  >(
    `SELECT id,kind,name,file_path filePath,start_line startLine,end_line endLine,symbol_kind symbolKind,exported,signature,provenance,confidence,tier,data FROM nodes LEFT JOIN files ON files.path=nodes.file_path ORDER BY id`,
  );
  const nodes = new Map<string, NodeDTO>(
    rows.map((r) => [
      r.id,
      { ...r, metrics: {}, data: r.data ? JSON.parse(r.data) : null, exported: !!r.exported },
    ]),
  );
  for (const m of store.all<{ id: string; metric: string; value: number }>(
    'SELECT node_id id,metric,value FROM metrics',
  )) {
    const n = nodes.get(m.id);
    if (n) n.metrics[m.metric] = m.value;
  }
  const edges = store
    .all<
      Omit<Edge, 'data'> & { data: string | null }
    >('SELECT src,dst,kind,provenance,confidence,file_path filePath,line,data FROM edges ORDER BY src,dst,kind')
    .map((e) => ({ ...e, data: e.data ? JSON.parse(e.data) : undefined }));
  const incoming = new Map<string, Edge[]>(),
    outgoing = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!nodes.has(e.src) || !nodes.has(e.dst)) continue;
    for (const [map, key] of [
      [incoming, e.dst],
      [outgoing, e.src],
    ] as const) {
      const group = map.get(key);
      if (group) group.push(e);
      else map.set(key, [e]);
    }
  }
  const flags = store
    .all<
      Omit<FlagDTO, 'node' | 'evidence'> & { node_id: string; evidence: string }
    >("SELECT * FROM flags ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,id")
    .flatMap(({ node_id, evidence, ...rest }) => {
      const n = nodes.get(node_id);
      return n ? [{ ...rest, node: ref(n), evidence: JSON.parse(evidence) } as FlagDTO] : [];
    });
  return { nodes, edges, incoming, outgoing, flags };
}
export type Catalog = ReturnType<typeof catalog>;
export function need(c: Catalog, id: string) {
  const n = c.nodes.get(id);
  if (!n) throw new CatalystError('NODE_NOT_FOUND', 'Unknown node: ' + id);
  return n;
}
export function features(s: Store, lang: Lang) {
  return s
    .all<{ json: string }>('SELECT json FROM features WHERE language=? ORDER BY id', lang)
    .map((r) => JSON.parse(r.json) as Feature);
}
export function summary(s: Store, id: string, lang: Lang): FileSummary | ModuleSummary | null {
  const r = s.one<{ json: string }>(
    'SELECT json FROM summaries WHERE node_id=? AND language=?',
    id,
    lang,
  );
  return r ? JSON.parse(r.json) : null;
}
