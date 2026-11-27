import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, type AnalysisResult } from './analysis.js';
const fixture = (name: string) =>
  fileURLToPath(new URL('../../../fixtures/repos/' + name + '/', import.meta.url));
let ts: AnalysisResult, py: AnalysisResult;
beforeAll(async () => {
  [ts, py] = await Promise.all([analyze(fixture('ts-basic')), analyze(fixture('py-basic'))]);
});
describe('structural analysis', () => {
  it('extracts JSX, resolves aliases and finds DB, service and environment usage', () => {
    const edges = ts.edges.map((e) => [e.src, e.kind, e.dst]);
    expect(edges).toEqual(
      expect.arrayContaining([
        ['sym:app/page.tsx#default', 'renders', 'sym:components/Button.tsx#Button'],
        ['sym:app/(dashboard)/billing/page.tsx#default', 'calls', 'sym:lib/session.ts#getCurrentUser'],
        ['route:PAGE /billing', 'handles', 'sym:app/(dashboard)/billing/page.tsx#default'],
        ['route:POST /api/webhooks/stripe', 'handles', 'sym:app/api/webhooks/stripe/route.ts#POST'],
        ['sym:lib/session.ts#getCurrentUser', 'reads', 'db:prisma:User'],
        ['sym:app/api/webhooks/stripe/route.ts#POST', 'writes', 'db:prisma:Subscription'],
        ['sym:app/api/webhooks/stripe/route.ts#POST', 'calls_service', 'svc:stripe'],
        ['file:lib/stripe.ts', 'uses_env', 'env:STRIPE_API_KEY'],
      ]),
    );
    expect(ts.nodes.find((n) => n.id === 'env:DATABASE_URL')?.data?.declaredIn).toBe('.env.example');
    expect(ts.flags.find((f) => f.rule === 'cycle')?.evidence.cycle).toEqual([
      'file:lib/a.ts',
      'file:lib/b.ts',
      'file:lib/a.ts',
    ]);
    expect(ts.flags.map((f) => f.id)).toContain('unused-export:sym:lib/unused.ts#neverUsed');
    expect(ts.nodes.find((n) => n.id === 'file:lib/db.ts')?.metrics.fan_in).toBe(2);
  });
  it('follows Python imported modules and mounted routes', () => {
    expect(py.edges.map((e) => [e.src, e.kind, e.dst])).toEqual(
      expect.arrayContaining([
        ['route:GET /items/', 'handles', 'sym:app/api/routes/items.py#list_items'],
        ['route:POST /items/', 'handles', 'sym:app/api/routes/items.py#create_item'],
        ['sym:app/api/routes/items.py#create_item', 'calls', 'sym:app/crud.py#create_item'],
        ['sym:app/crud.py#create_item', 'writes', 'db:sqlalchemy:Item'],
        ['sym:app/crud.py#list_items', 'reads', 'db:sqlalchemy:Item'],
      ]),
    );
    expect(py.nodes.find((n) => n.id === 'env:SECRET_KEY')?.data?.category).toBe('secret');
  });
  it('handles workspace exports, tsconfig paths, barrels, and ESM extensions', async () => {
    const r = await analyze(fixture('ts-alias'));
    expect(
      r.edges.filter((e) => e.src === 'file:apps/web/src/a.ts' && e.kind === 'imports').map((e) => e.dst),
    ).toEqual(
      expect.arrayContaining([
        'file:apps/web/src/b.ts',
        'file:apps/web/src/c.ts',
        'file:packages/ui/src/button.tsx',
        'file:apps/web/src/index.ts',
      ]),
    );
    expect(r.edges.some((e) => e.dst === 'sym:apps/web/src/thing.ts#Thing' && e.kind === 'references')).toBe(
      true,
    );
  });
  it('reuses cached parses and respects cancellation', async () => {
    const events: number[] = [];
    const r = await analyze(fixture('ts-basic'), {
      previous: ts,
      onProgress: (s, _d, t) => {
        if (s === 'parse') events.push(t);
      },
    });
    expect(events).toEqual([0]);
    expect(r.changed).toEqual([]);
    expect(r.nodes).toEqual(ts.nodes);
    await expect(analyze(fixture('ts-basic'), { signal: AbortSignal.abort() })).rejects.toThrow();
  });
  it('limits analysis to include patterns and reparses a stale adapter cache', async () => {
    const r = await analyze(fixture('ts-basic'), { include: ['lib/**'] });
    expect(r.files.every((f) => f.path.startsWith('lib/'))).toBe(true);
    const stale = {
      ...r,
      files: r.files.map((f) => (f.path === 'lib/db.ts' ? { ...f, parsedHash: 'previous adapter' } : f)),
    };
    const counts: number[] = [];
    await analyze(fixture('ts-basic'), {
      include: ['lib/**'],
      previous: stale,
      onProgress: (s, _d, t) => {
        if (s === 'parse') counts.push(t);
      },
    });
    expect(counts).toEqual([1, 1]);
  });
  it('records unreadable content and skips excluded paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'catalyst-scan-'));
    try {
      await cp(fixture('broken'), root, { recursive: true });
      await mkdir(join(root, 'nested'));
      await writeFile(join(root, 'large.ts'), Buffer.alloc(2 * 1024 * 1024, 97));
      await writeFile(join(root, 'binary.dat'), Buffer.from([0, 1, 2]));
      await writeFile(join(root, 'nested', '.gitignore'), 'ignored.ts\n');
      await writeFile(join(root, 'nested', 'ignored.ts'), '');
      await writeFile(join(root, '.env'), 'NEVER=read');
      await writeFile(join(root, '.env.sample'), 'SECRET=should-not-be-retained');
      const r = await analyze(root);
      const paths = r.files.map((f) => f.path);
      expect(paths).not.toContain('.env');
      expect(paths).not.toContain('nested/ignored.ts');
      expect(r.files.find((f) => f.path === '.env.sample')?.source).toBe('SECRET');
      expect(r.files.find((f) => f.path === 'bad.ts')?.parseError).toBe('partial');
      expect(r.files.find((f) => f.path === 'large.ts')?.parseError).toBe('too_large');
      expect(r.files.find((f) => f.path === 'vendor.min.js')?.parseError).toBe('minified');
      expect(r.nodes.some((n) => n.filePath === 'binary.dat')).toBe(false);
      await rm(join(root, 'ok.ts'));
      const updated = await analyze(root, { previous: r });
      expect(updated.deleted).toEqual(['ok.ts']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
