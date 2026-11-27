import { ids, type EdgeKind, type NodeDTO, type Provenance } from '@catalyst/shared';
export interface AnalysisEdge {
  src: string;
  dst: string;
  kind: EdgeKind;
  filePath: string | null;
  line: number | null;
  data: Record<string, unknown>;
  provenance: Provenance;
  confidence: number;
}
export class Model {
  nodes = new Map<string, NodeDTO>();
  edges = new Map<string, AnalysisEdge>();
  node(id: string, name: string, patch: Partial<NodeDTO> = {}) {
    let row = this.nodes.get(id);
    if (!row) {
      row = {
        id,
        kind: ids.kindOf(id),
        name,
        filePath: null,
        startLine: null,
        endLine: null,
        symbolKind: null,
        signature: null,
        exported: false,
        provenance: 'ast',
        confidence: 1,
        tier: null,
        data: {},
        metrics: {},
      };
      this.nodes.set(id, row);
    }
    return Object.assign(row, { ...patch, data: { ...row.data, ...patch.data } });
  }
  edge(
    src: string,
    dst: string,
    kind: EdgeKind,
    filePath: string | null = null,
    line: number | null = null,
    provenance: Provenance = 'ast',
    confidence = 1,
    data: Record<string, unknown> = {},
  ) {
    const key = JSON.stringify([src, dst, kind]);
    const prior = this.edges.get(key);
    if (prior) {
      prior.data.count = Number(prior.data.count ?? 1) + 1;
      if (data.names)
        prior.data.names = [
          ...new Set([...((prior.data.names as string[]) ?? []), ...(data.names as string[])]),
        ];
      if (prior.data.typeOnly !== undefined)
        prior.data.typeOnly = Boolean(prior.data.typeOnly && data.typeOnly);
      return;
    }
    this.edges.set(key, {
      src,
      dst,
      kind,
      filePath,
      line,
      provenance,
      confidence,
      data: { ...data, count: 1 },
    });
  }
}
export const sourceId = (path: string, caller: string) =>
  caller === '<module>' ? ids.file(path) : ids.sym(path, caller);
