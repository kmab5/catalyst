import type Database from 'better-sqlite3';
import type {
  AppOverview,
  EdgeKind,
  Feature,
  FileSummary,
  FlagDTO,
  Lang,
  ModuleSummary,
  NodeDTO,
  NodeKind,
  Provenance,
  RunDTO,
} from '@catalyst/shared';
export type NodeRow = Omit<NodeDTO, 'metrics' | 'tier'>;
export type EdgeRow = {
  src: string;
  dst: string;
  kind: EdgeKind;
  provenance: Provenance;
  confidence: number;
  filePath: string | null;
  line: number | null;
  data: Record<string, unknown> | null;
};
export type FileRow = {
  path: string;
  hash: string;
  language: string;
  tier: number;
  loc: number;
  sizeBytes: number;
  parsedHash: string | null;
  parseError: string | null;
};
export type FlagRow = Omit<FlagDTO, 'node'> & { nodeId: string };
export type SummaryRow = {
  nodeId: string;
  language: Lang;
  kind: 'file' | 'module' | 'symbol';
  inputHash: string;
  model: string;
  json: FileSummary | ModuleSummary;
  createdAt: number;
};
export type FtsRow = {
  nodeId: string;
  kind: NodeKind;
  name: string;
  path: string;
  summary: string;
  tags: string;
  code: string;
};
export type FtsHit = { nodeId: string; snippet: string; rank: number };
export interface Access {
  db: Database.Database;
  stmt(sql: string): Database.Statement;
  all<T>(sql: string, ...p: unknown[]): T[];
  one<T>(sql: string, ...p: unknown[]): T | undefined;
  saveRun(run: RunDTO): void;
  run(id: string): RunDTO | null;
}
export function repositories(a: Access) {
  const tx = <T>(fn: () => T) => a.db.transaction(fn)();
  // Table and column names come exclusively from the declarations below.
  function table<T extends object>(
    name: string,
    columns: (keyof T & string)[],
    json: string[] = [],
    bool: string[] = [],
  ) {
    const column = (key: string) => key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    const insert = a.stmt(
      'INSERT OR REPLACE INTO ' +
        name +
        ' (' +
        columns.map(column).join(',') +
        ') VALUES (' +
        columns.map(() => '?').join(',') +
        ')',
    );
    const select =
      'SELECT ' + columns.map((k) => column(k) + ' AS ' + k).join(',') + ' FROM ' + name;
    const put = (r: T) =>
      insert.run(
        ...columns.map((k) =>
          json.includes(k)
            ? JSON.stringify(r[k] ?? null)
            : bool.includes(k)
              ? Number(r[k])
              : (r[k] ?? null),
        ),
      );
    const rows = (where = '', ...params: unknown[]) =>
      a.all<Record<string, unknown>>(select + where, ...params).map((row) => {
        for (const k of json) row[k] = row[k] === null ? null : JSON.parse(String(row[k]));
        for (const k of bool) row[k] = !!row[k];
        return row as T;
      });
    return {
      put,
      rows,
      first: (where: string, ...params: unknown[]) => rows(where, ...params)[0] ?? null,
    };
  }
  const file = table<FileRow>('files', [
    'path',
    'hash',
    'language',
    'tier',
    'loc',
    'sizeBytes',
    'parsedHash',
    'parseError',
  ]);
  const node = table<NodeRow>(
    'nodes',
    [
      'id',
      'kind',
      'name',
      'filePath',
      'startLine',
      'endLine',
      'symbolKind',
      'exported',
      'signature',
      'provenance',
      'confidence',
      'data',
    ],
    ['data'],
    ['exported'],
  );
  const edge = table<EdgeRow>(
    'edges',
    ['src', 'dst', 'kind', 'filePath', 'line', 'provenance', 'confidence', 'data'],
    ['data'],
  );
  const summary = table<SummaryRow>(
    'summaries',
    ['nodeId', 'language', 'kind', 'inputHash', 'model', 'json', 'createdAt'],
    ['json'],
  );
  const flag = table<FlagRow>(
    'flags',
    ['id', 'rule', 'severity', 'nodeId', 'title', 'explanation', 'evidence'],
    ['evidence'],
  );
  function edges(where: string, id: string, kinds?: EdgeKind[]) {
    return edge.rows(where, id).filter((e) => !kinds || kinds.includes(e.kind));
  }
  const del = (sql: string, ...params: unknown[]) => a.stmt('DELETE FROM ' + sql).run(...params);
  return {
    tx,
    files: {
      upsert: file.put,
      all: () => file.rows(),
      get: (path: string) => file.first(' WHERE path=?', path),
      delete: (path: string) => del('files WHERE path=?', path),
      setParsed: (path: string, hash: string, err: string | null) =>
        a.stmt('UPDATE files SET parsed_hash=?,parse_error=? WHERE path=?').run(hash, err, path),
    },
    nodes: {
      upsertMany: (rows: NodeRow[]) => tx(() => rows.forEach(node.put)),
      get: (id: string) => node.first(' WHERE id=?', id),
      exists: (id: string) => !!a.one('SELECT 1 FROM nodes WHERE id=?', id),
      all: () => node.rows(),
      byKind: (kind: NodeKind) => node.rows(' WHERE kind=?', kind),
      byFile: (path: string) => node.rows(' WHERE file_path=?', path),
      deleteByFile: (path: string) => del('nodes WHERE file_path=?', path),
    },
    edges: {
      upsertMany: (rows: EdgeRow[]) => tx(() => rows.forEach(edge.put)),
      all: () => edge.rows(),
      out: (id: string, kinds?: EdgeKind[]) => edges(' WHERE src=?', id, kinds),
      in: (id: string, kinds?: EdgeKind[]) => edges(' WHERE dst=?', id, kinds),
      deleteByFile: (path: string) => del('edges WHERE file_path=?', path),
      deleteByKind: (kind: EdgeKind) => del('edges WHERE kind=?', kind),
    },
    summaries: {
      get: (id: string, lang: Lang) => summary.first(' WHERE node_id=? AND language=?', id, lang),
      put: summary.put,
      all: (lang: Lang) => summary.rows(' WHERE language=?', lang),
    },
    features: {
      all: (lang: Lang) =>
        a
          .all<{ json: string }>('SELECT json FROM features WHERE language=?', lang)
          .map((r) => JSON.parse(r.json) as Feature),
      put: (f: Feature, lang: Lang, hash: string) =>
        a
          .stmt('INSERT OR REPLACE INTO features VALUES (?,?,?,?,?)')
          .run(f.id, lang, JSON.stringify(f), hash, Date.now()),
      clear: (lang: Lang) => del('features WHERE language=?', lang),
    },
    overview: {
      get: (lang: Lang) =>
        JSON.parse(
          a.one<{ json: string }>('SELECT json FROM overview WHERE language=?', lang)?.json ??
            'null',
        ) as AppOverview | null,
      put: (o: AppOverview, lang: Lang, hash: string) =>
        a
          .stmt('INSERT OR REPLACE INTO overview VALUES (?,?,?,?)')
          .run(lang, JSON.stringify(o), hash, Date.now()),
    },
    metrics: {
      set: (id: string, k: string, v: number) =>
        a.stmt('INSERT OR REPLACE INTO metrics VALUES (?,?,?)').run(id, k, v),
      get: (id: string) =>
        Object.fromEntries(
          a
            .all<{
              metric: string;
              value: number;
            }>('SELECT metric,value FROM metrics WHERE node_id=?', id)
            .map((r) => [r.metric, r.value]),
        ) as Record<string, number>,
      top: (k: string, n: number, kind?: NodeKind) =>
        a.all<{ nodeId: string; value: number }>(
          'SELECT node_id nodeId,value FROM metrics JOIN nodes ON id=node_id WHERE metric=?' +
            (kind ? ' AND kind=?' : '') +
            ' ORDER BY value DESC,node_id LIMIT ?',
          k,
          ...(kind ? [kind] : []),
          n,
        ),
      clear: () => del('metrics'),
    },
    flags: {
      all: () => flag.rows(),
      forNode: (id: string) => flag.rows(' WHERE node_id=?', id),
      replaceAll: (rows: FlagRow[]) =>
        tx(() => {
          del('flags');
          rows.forEach(flag.put);
        }),
    },
    llmCache: {
      get: (key: string) =>
        a.one<{ response: string }>('SELECT response FROM llm_cache WHERE key=?', key)?.response ??
        null,
      put: (key: string, response: string, tin: number, tout: number) =>
        a
          .stmt('INSERT OR REPLACE INTO llm_cache VALUES (?,?,?,?,?)')
          .run(key, response, tin, tout, Date.now()),
    },
    runs: {
      get: a.run,
      last: () => {
        const id = a.one<{ id: string }>(
          'SELECT id FROM runs ORDER BY started_at DESC LIMIT 1',
        )?.id;
        return id ? a.run(id) : null;
      },
      create: (id: string) =>
        a.saveRun({
          id,
          startedAt: Date.now(),
          status: 'running',
          stats: null,
          lastEvent: null,
          finishedAt: null,
          error: null,
        }),
      finish: (id: string, status: RunDTO['status'], stats: RunDTO['stats'], error?: string) => {
        const r = a.run(id);
        if (r) a.saveRun({ ...r, status, stats, error: error ?? null, finishedAt: Date.now() });
      },
    },
    fts: {
      replaceNode: (r: FtsRow) =>
        tx(() => {
          del('search_fts WHERE node_id=?', r.nodeId);
          a.stmt('INSERT INTO search_fts VALUES (?,?,?,?,?,?,?)').run(
            r.nodeId,
            r.kind,
            r.name,
            r.path,
            r.summary,
            r.tags,
            r.code,
          );
        }),
      deleteByNode: (id: string) => del('search_fts WHERE node_id=?', id),
      deleteByFile: (path: string) => del('search_fts WHERE path=?', path),
      search: (q: string, limit: number, kind?: NodeKind) => {
        const terms = q.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 20);
        if (!terms?.length) return [];
        return a.all<FtsHit>(
          "SELECT node_id nodeId,snippet(search_fts,-1,'«','»','…',12) snippet,bm25(search_fts,0,0,8,5,4,3,1) rank FROM search_fts WHERE search_fts MATCH ?" +
            (kind ? ' AND kind=?' : '') +
            ' ORDER BY rank LIMIT ?',
          terms.map((t) => '"' + t + '"*').join(' AND '),
          ...(kind ? [kind] : []),
          limit,
        );
      },
    },
  };
}
