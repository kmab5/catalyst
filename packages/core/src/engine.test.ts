import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  GraphResponse,
  HealthDTO,
  ImpactDTO,
  OverviewDTO,
  TreeNodeDTO,
  XRayDTO,
  ids,
} from '@catalyst/shared';
import { createEngine, type Engine, type Project } from './engine.js';

const fixture = fileURLToPath(new URL('../../../fixtures/repos/ts-basic', import.meta.url));
let dir: string, root: string, engine: Engine, project: Project;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'catalyst-runtime-'));
  root = join(dir, 'repo');
  await cp(fixture, root, { recursive: true, filter: (p) => !p.endsWith('.catalyst') });
  engine = createEngine({ homeDir: join(dir, 'home'), env: {} });
  project = await engine.projects.open(root);
});
afterEach(async () => {
  await engine.close();
  await rm(dir, { recursive: true, force: true });
});
describe('index lifecycle and queries', () => {
  it('preserves progress history, source ranges, search and upstream routes after restart', async () => {
    expect(() => project.query).toThrowError(expect.objectContaining({ code: 'NOT_INDEXED' }));
    const run = project.index({ ai: false });
    expect(() => project.index()).toThrowError(expect.objectContaining({ code: 'INDEX_RUNNING' }));
    expect((await run.done).status).toBe('done');
    const events = [];
    for await (const item of run.events()) events.push(item);
    expect([...new Set(events.map((x) => x.event.stage))]).toEqual([
      'scan',
      'parse',
      'resolve',
      'detect',
      'graph',
      'health',
      'fts',
      'done',
    ]);
    const resumed = [];
    for await (const item of run.events(3)) resumed.push(item.id);
    expect(resumed).toEqual(events.slice(3).map((x) => x.id));
    const q = project.query,
      id = ids.sym('lib/session.ts', 'getCurrentUser');
    OverviewDTO.parse(q.getOverview('en'));
    TreeNodeDTO.parse(q.getTree());
    HealthDTO.parse(q.getHealth());
    expect(GraphResponse.parse(q.graph({ level: 'file', limit: 3 }))).toMatchObject({
      truncated: true,
    });
    expect(XRayDTO.parse(q.getXRay(id, 'en')).sideEffects.map((s) => s.kind)).toContain('db_read');
    expect(ImpactDTO.parse(q.impact(id, { direction: 'up', depth: 3 })).routes).toContain(
      ids.route('PAGE', '/billing'),
    );
    expect((await q.getSource(id)).text).toContain('getCurrentUser');
    expect(q.find('getcu')[0]?.node.id).toBe(id);
    expect(
      q
        .search('stripe webhook')
        .slice(0, 3)
        .map((r) => r.node.id),
    ).toContain(ids.file('app/api/webhooks/stripe/route.ts'));
    await engine.close();
    engine = createEngine({ homeDir: join(dir, 'home'), env: {} });
    const opened = engine.projects.get(project.id)!;
    expect(opened.getRun(run.id)?.status).toBe('done');
    const warm = opened.index({ ai: false });
    const parse = [];
    for await (const item of warm.events())
      if (item.event.stage === 'parse') parse.push(item.event.total);
    expect(parse).toEqual([0]);
    expect((await warm.done).stats?.llmCalls).toBe(0);
  });
  it('cancels, retries, and removes deleted nodes and search hits', async () => {
    const run = project.index({ ai: false });
    run.cancel();
    expect((await run.done).status).toBe('cancelled');
    expect((await project.index({ ai: false }).done).status).toBe('done');
    await rm(join(root, 'lib', 'unused.ts'));
    expect((await project.index({ ai: false }).done).status).toBe('done');
    expect(project.query.find('neverUsed')).toEqual([]);
  });
  it('maps edited Git hunks to symbol and route impact', async () => {
    function git(...args: string[]) {
      execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    }
    git('init');
    git('add', '.');
    git(
      '-c',
      'user.name=Catalyst',
      '-c',
      'user.email=local@example.invalid',
      'commit',
      '-qm',
      'Fixture',
    );
    await project.index({ ai: false }).done;
    const path = join(root, 'lib', 'session.ts');
    const contents = await readFile(path, 'utf8');
    await writeFile(path, contents.replace('findUnique', 'findFirst'));
    const diff = await project.query.diffImpact({});
    expect(diff.changedNodes.map((n) => n.id)).toContain(
      ids.sym('lib/session.ts', 'getCurrentUser'),
    );
    expect(diff.affected.routes.map((n) => n.id)).toContain(ids.route('PAGE', '/billing'));
  });
  it('keeps omitted credentials, clears explicit null and persists settings privately', () => {
    engine.settings.update({ provider: { type: 'openrouter', apiKey: 'test-key-123456789' } });
    expect(
      engine.settings.update({ provider: { type: 'openrouter' } }).provider?.apiKeyMasked,
    ).toBe('test-k…6789');
    expect(JSON.stringify(engine.settings.get())).not.toContain('test-key-123456789');
    expect(
      engine.settings.update({ provider: { type: 'openrouter', apiKey: null } }).provider,
    ).toBeNull();
  });
  it('rejects nonexistent roots and forgets projects without deleting their source', async () => {
    await expect(engine.projects.open(join(dir, 'absent'))).rejects.toMatchObject({
      code: 'PATH_NOT_FOUND',
    });
    expect(engine.projects.list()).toHaveLength(1);
    expect(engine.browse(dir).entries.map((e) => e.name)).toContain('repo');
    await engine.projects.forget(project.id, { purge: true });
    expect(engine.projects.list()).toEqual([]);
    expect(await readFile(join(root, 'lib/session.ts'), 'utf8')).toContain('getCurrentUser');
  });
});
