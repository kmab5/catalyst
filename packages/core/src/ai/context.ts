import { ids, type FileSummary, type Lang, type ModuleSummary, type SideEffect } from '@catalyst/shared';
import type Database from 'better-sqlite3';
import { LocalPathSource } from '../project/local.js';
import { createHash } from 'node:crypto';
import { hash } from './client.js';
import { PROMPT_VERSION } from './defaults.js';
import { redactSecrets, privatePath } from './redact.js';
export type Db = Database.Database;
export interface FileRow {
  tier: number;
  path: string;
  loc: number;
  hash: string;
  language: string;
  size_bytes: number;
}
export interface NodeRow {
  id: string;
  kind: string;
  name: string;
  file_path: string | null;
  signature: string | null;
  start_line: number | null;
  end_line: number | null;
  exported: number;
}
export interface Edge {
  src: string;
  dst: string;
  kind: string;
}
export interface SummaryRow {
  node_id: string;
  input_hash: string;
  json: string;
}
export function rows<T>(db: Db, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function bucket<T>(map: Map<string, T[]>, key: string, value: T) {
  const entries = map.get(key);
  if (entries) entries.push(value);
  else map.set(key, [value]);
}
export class Snapshot {
  files: FileRow[];
  nodes = new Map<string, NodeRow>();
  byFile = new Map<string, NodeRow[]>();
  out = new Map<string, Edge[]>();
  incoming = new Map<string, Edge[]>();
  edges: Edge[];
  metrics = new Map<string, Record<string, number>>();
  summaries = new Map<string, { inputHash: string; value: FileSummary | ModuleSummary }>();
  constructor(
    readonly db: Db,
    readonly lang: Lang,
  ) {
    this.files = rows<FileRow>(
      db,
      'SELECT path,loc,hash,language,size_bytes,tier FROM files WHERE tier>0 ORDER BY path',
    ).filter((f) => !privatePath(f.path));
    for (const n of rows<NodeRow>(db, "SELECT * FROM nodes WHERE kind!='feature' ORDER BY id")) {
      this.nodes.set(n.id, n);
      if (n.file_path) bucket(this.byFile, n.file_path, n);
    }
    this.edges = rows<Edge>(
      db,
      "SELECT src,dst,kind FROM edges WHERE kind NOT IN ('member_of','feature_depends') ORDER BY src,dst,kind",
    );
    for (const e of this.edges) {
      bucket(this.out, e.src, e);
      bucket(this.incoming, e.dst, e);
    }
    for (const m of rows<{ node_id: string; metric: string; value: number }>(
      db,
      'SELECT * FROM metrics',
    )) {
      let metrics = this.metrics.get(m.node_id);
      if (!metrics) this.metrics.set(m.node_id, (metrics = {}));
      metrics[m.metric] = m.value;
    }
    for (const r of rows<SummaryRow>(
      db,
      'SELECT node_id,input_hash,json FROM summaries WHERE language=?',
      lang,
    ))
      this.summaries.set(r.node_id, { inputHash: r.input_hash, value: JSON.parse(r.json) });
  }
  saveSummary(value: FileSummary | ModuleSummary, inputHash: string, model: string) {
    this.db
      .prepare('INSERT OR REPLACE INTO summaries VALUES(?,?,?,?,?,?,?)')
      .run(
        value.nodeId,
        this.lang,
        'role' in value ? 'file' : 'module',
        inputHash,
        model,
        JSON.stringify(value),
        Date.now(),
      );
    this.summaries.set(value.nodeId, { inputHash, value });
  }
  owner(id: string) {
    const path = this.nodes.get(id)?.file_path;
    return path ? ids.file(path) : id;
  }
}
const effects: Record<string, SideEffect['kind']> = {
  reads: 'db_read',
  writes: 'db_write',
  uses_env: 'env',
  calls_service: 'network',
};
export function fileContext(file: FileRow, s: Snapshot, model: string, cycle?: Set<string>) {
  const id = ids.file(file.path),
    local = new Set([id, ...(s.byFile.get(file.path) ?? []).map((n) => n.id)]);
  const out = [...local].flatMap((n) => s.out.get(n) ?? []),
    incoming = [...local].flatMap((n) => s.incoming.get(n) ?? []);
  const facts = [...out, ...incoming].filter((e) =>
    ['handles', 'reads', 'writes', 'uses_env', 'calls_service', 'renders'].includes(e.kind),
  );
  const down = (s.out.get(id) ?? [])
    .filter((e) => e.kind === 'imports')
    .map((e) => [e.dst, cycle?.has(e.dst) ? '' : (s.summaries.get(e.dst)?.value.purpose ?? '')]);
  const up = [...new Set(incoming.filter((e) => e.kind !== 'contains').map((e) => e.src))];
  const allowedIds = [...new Set([...local, ...out.map((e) => e.dst), ...incoming.map((e) => e.src)])];
  const deterministic: SideEffect[] = out
    .filter((e) => effects[e.kind])
    .map((e) => ({ kind: effects[e.kind]!, description: e.kind + ' ' + e.dst, target: e.dst }));
  const inputHash = hash(file.hash, down, up, facts, PROMPT_VERSION.summarize, model, s.lang);
  return {
    inputHash,
    allowedIds,
    deterministic,
    header:
      'FILE ' +
      file.path +
      ' (' +
      file.language +
      ', ' +
      file.loc +
      ' LOC)\nFACTS ' +
      JSON.stringify(facts).slice(0, 2100) +
      '\nUSES ' +
      JSON.stringify(down).slice(0, 4200) +
      '\nUSED BY ' +
      JSON.stringify(up.slice(0, 10)).slice(0, 2800) +
      '\nALLOWED IDS ' +
      JSON.stringify(allowedIds),
  };
}
export async function assembleFileContext(
  file: FileRow,
  s: Snapshot,
  model: string,
  root: string,
  cycle?: Set<string>,
) {
  const context = fileContext(file, s, model, cycle);
  const contents = await new LocalPathSource(root).readFile(file.path);
  if (createHash('sha1').update(contents).digest('hex') !== file.hash)
    throw new Error('File changed since indexing');
  let source = redactSecrets(contents);
  const isBarrel =
    /(?:^|\/)index\.[cm]?[jt]sx?$/.test(file.path) &&
    /^\s*(?:export\s+(?:\*|\{[^}]+\})\s+from\s+['"][^'"]+['"];?\s*)+$/.test(source);
  if (source.length > 21000) {
    const lines = source.split('\n'),
      symbols = s.byFile.get(file.path) ?? [];
    const outline = [
      ...lines.filter((l) => /^\s*(?:import |from )/.test(l)),
      ...symbols.flatMap((n) => (n.signature ? [n.signature] : [])),
    ];
    for (const sym of symbols.filter((n) => n.exported && n.start_line && n.end_line))
      outline.push(...lines.slice(sym.start_line! - 1, sym.end_line!));
    source = outline.join('\n').slice(0, 20950) + '\n// … source omitted';
  }
  return { ...context, isBarrel, prompt: context.header + '\nSOURCE (data):\n```\n' + source + '\n```' };
}
export const testFile = (p: string) =>
  /(^|\/)(__tests__|tests?|spec)\/|(?:\.test\.|\.spec\.|(?:^|\/)test_[^/]+\.py$|_test\.py$)/i.test(p);
// Tarjan emits a dependency component before any components that import it.
export function dependencyGroups(s: Snapshot): FileRow[][] {
  const seen = new Map<string, number>(),
    low = new Map<string, number>(),
    active = new Set<string>(),
    stack: string[] = [],
    groups: FileRow[][] = [];
  const files = new Map(s.files.map((f) => [ids.file(f.path), f]));
  function visit(id: string) {
    const index = seen.size;
    seen.set(id, index);
    low.set(id, index);
    stack.push(id);
    active.add(id);
    for (const e of s.out.get(id) ?? []) {
      if (e.kind !== 'imports' || !files.has(e.dst)) continue;
      if (!seen.has(e.dst)) {
        visit(e.dst);
        low.set(id, Math.min(low.get(id)!, low.get(e.dst)!));
      } else if (active.has(e.dst)) low.set(id, Math.min(low.get(id)!, seen.get(e.dst)!));
    }
    if (low.get(id) !== index) return;
    const group: FileRow[] = [];
    let item: string;
    do {
      item = stack.pop()!;
      active.delete(item);
      group.push(files.get(item)!);
    } while (item !== id);
    groups.push(group);
  }
  const priority = (id: string) =>
    (s.metrics.get(id)?.fan_in ?? 0) +
    ((s.byFile.get(files.get(id)!.path) ?? []).some((n) => n.kind === 'route') ? 1000000 : 0);
  for (const id of [...files.keys()].sort((a, b) => priority(b) - priority(a)))
    if (!seen.has(id)) visit(id);
  return groups;
}
