import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { schema } from './schema.js';
import { repositories } from './repos.js';
import type { AnalysisResult } from '../analysis.js';
import type { RunDTO } from '@catalyst/shared';

export interface Store extends ReturnType<typeof repositories> {
  db: Database.Database;
  stmt(sql: string): Database.Statement;
  all<T>(sql: string, ...params: unknown[]): T[];
  one<T>(sql: string, ...params: unknown[]): T | undefined;
  meta: { get(key: string): string | null; set(key: string, value: string): void };
  saveRun(run: RunDTO): void;
  run(id: string): RunDTO | null;
  saveAnalysis(result: AnalysisResult): void;
  close(): void;
}
export function openStore(path: string): Store {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  try {
    db.transaction(() => {
      const version = db.pragma('user_version', { simple: true });
      if (version === 0) {
        db.exec(schema.replace('PRAGMA journal_mode = WAL;', ''));
        db.prepare('INSERT INTO meta VALUES (?, ?)').run('schema_version', '1');
        db.pragma('user_version = 1');
      } else if (version !== 1) throw new Error('Unsupported Catalyst index schema');
      db.exec(
        'CREATE TABLE IF NOT EXISTS run_events (run_id TEXT NOT NULL, seq INTEGER NOT NULL, event TEXT NOT NULL, PRIMARY KEY (run_id,seq))',
      );
    }).immediate();
  } catch (err) {
    db.close();
    throw err;
  }
  const cache = new Map<string, Database.Statement>();
  function stmt(sql: string) {
    let prepared = cache.get(sql);
    if (!prepared) {
      prepared = db.prepare(sql);
      cache.set(sql, prepared);
    }
    return prepared;
  }
  function all<T>(sql: string, ...params: unknown[]): T[] {
    return stmt(sql).all(...params) as T[];
  }
  function one<T>(sql: string, ...params: unknown[]): T | undefined {
    return stmt(sql).get(...params) as T | undefined;
  }
  const meta = {
    get(key: string) {
      return one<{ value: string }>('SELECT value FROM meta WHERE key=?', key)?.value ?? null;
    },
    set(key: string, value: string) {
      stmt('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key, value);
    },
  };
  function saveRun(run: RunDTO) {
    stmt('INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?)').run(
      run.id,
      run.startedAt,
      run.finishedAt,
      run.status,
      JSON.stringify({ stats: run.stats, lastEvent: run.lastEvent, error: run.error }),
    );
  }
  function run(id: string): RunDTO | null {
    const row = one<{
      id: string;
      started_at: number;
      finished_at: number | null;
      status: RunDTO['status'];
      stats: string;
    }>('SELECT * FROM runs WHERE id=?', id);
    return row
      ? {
          id: row.id,
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          status: row.status,
          ...JSON.parse(row.stats),
        }
      : null;
  }
  function saveAnalysis(result: AnalysisResult) {
    db.transaction(() => {
      db.exec(
        "DELETE FROM files; DELETE FROM nodes WHERE kind <> 'feature'; DELETE FROM edges WHERE kind NOT IN ('feature_depends','member_of'); DELETE FROM flags; DELETE FROM metrics",
      );
      for (const f of result.files)
        stmt('INSERT INTO files VALUES (?,?,?,?,?,?,?,?)').run(
          f.path,
          f.hash,
          f.language,
          f.tier,
          f.loc,
          f.sizeBytes,
          f.parsedHash,
          f.parseError,
        );
      for (const n of result.nodes) {
        stmt('INSERT OR REPLACE INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
          n.id,
          n.kind,
          n.name,
          n.filePath,
          n.startLine,
          n.endLine,
          n.symbolKind,
          Number(n.exported),
          n.signature,
          n.provenance,
          n.confidence,
          JSON.stringify(n.data),
        );
        for (const [metric, value] of Object.entries(n.metrics))
          stmt('INSERT INTO metrics VALUES (?,?,?)').run(n.id, metric, value);
      }
      for (const e of result.edges)
        stmt('INSERT OR REPLACE INTO edges VALUES (?,?,?,?,?,?,?,?)').run(
          e.src,
          e.dst,
          e.kind,
          e.provenance,
          e.confidence,
          e.filePath,
          e.line,
          JSON.stringify(e.data),
        );
      for (const f of result.flags)
        stmt('INSERT OR REPLACE INTO flags VALUES (?,?,?,?,?,?,?)').run(
          f.id,
          f.rule,
          f.severity,
          f.node.id,
          f.title,
          f.explanation,
          JSON.stringify(f.evidence),
        );
      db.exec(
        'DELETE FROM summaries WHERE node_id NOT IN (SELECT id FROM nodes); DELETE FROM edges WHERE src NOT IN (SELECT id FROM nodes) OR dst NOT IN (SELECT id FROM nodes)',
      );
      meta.set('stack_json', JSON.stringify(result.stack));
      meta.set(
        'parse_cache',
        JSON.stringify({
          files: result.files.map(({ source, ...rest }) => rest),
          parsed: result.parsed,
        }),
      );
    })();
  }
  return {
    db,
    stmt,
    all,
    one,
    meta,
    saveRun,
    run,
    saveAnalysis,
    ...repositories({ db, stmt, all, one, saveRun, run }),
    close: () => db.close(),
  };
}
