import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleNodeDTO } from '@catalyst/shared';
import { openStore } from './index.js';
const dirs: string[] = [];
afterEach(() => {
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true });
});
it('opens the versioned SQLite schema with WAL and preserves typed node and edge data', () => {
  const path = mkdtempSync(join(tmpdir(), 'catalyst-store-'));
  dirs.push(path);
  const db = join(path, 'project.db'),
    s = openStore(db);
  try {
    expect(s.meta.get('schema_version')).toBe('1');
    expect(s.db.pragma('journal_mode', { simple: true })).toBe('wal');
    const n = { ...sampleNodeDTO, data: { isTest: true } };
    s.nodes.upsertMany([n]);
    expect(s.nodes.get(n.id)).toMatchObject({ data: n.data, exported: n.exported });
    const e = {
      src: n.id,
      dst: n.id,
      kind: 'references' as const,
      provenance: 'ast' as const,
      confidence: 1,
      filePath: n.filePath,
      line: 1,
      data: { role: 'entry' },
    };
    s.edges.upsertMany([e]);
    expect(s.edges.out(n.id, ['references'])).toEqual([e]);
    expect(() =>
      s.tx(() => {
        s.meta.set('rollback', '1');
        throw Error();
      }),
    ).toThrow();
    expect(s.meta.get('rollback')).toBeNull();
  } finally {
    s.close();
  }
  const reopened = openStore(db);
  try {
    expect(reopened.nodes.all()).toHaveLength(1);
  } finally {
    reopened.close();
  }
});
it('quotes arbitrary user terms before prefix search and deletes FTS rows by path', () => {
  const s = openStore(':memory:');
  try {
    s.fts.replaceNode({
      nodeId: 'file:test.ts',
      kind: 'file',
      name: 'webhook',
      path: 'test.ts',
      summary: 'Handles Stripe webhooks',
      tags: 'payment',
      code: '',
    });
    expect(s.fts.search('stripe webhook', 5)[0]?.snippet).toContain('«');
    expect(() => s.fts.search('""" OR ( / : )', 5)).not.toThrow();
    s.fts.deleteByFile('test.ts');
    expect(s.fts.search('stripe', 5)).toEqual([]);
  } finally {
    s.close();
  }
});
