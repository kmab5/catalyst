import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
import { LocalPathSource } from './project/local.js';

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
  it('reads through a project root alias and rejects linked directories inside it', async () => {
    const alias = join(dir, 'project-alias');
    await symlink(root, alias, 'junction');
    await symlink(join(root, 'lib'), join(root, 'linked-lib'), 'junction');
    const source = new LocalPathSource(alias);
    await expect(source.readFile('lib/session.ts')).resolves.toContain('getCurrentUser');
    await expect(source.readFile('linked-lib/session.ts')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('applies environment overrides without replacing stored provider credentials or metadata', async () => {
    const env: NodeJS.ProcessEnv = {};
    const home = join(dir, 'overrides');
    const context = createEngine({ homeDir: home, env });
    try {
      context.settings.update({ provider: { type: 'openai-compatible', apiKey: 'saved-only-1234', baseUrl: 'http://localhost:1200/v1' } });
      env.OPENAI_API_KEY = 'environment-only-5678';
      env.OPENAI_BASE_URL = 'http://localhost:1300/v1';
      expect(context.settings.get().provider).toMatchObject({ apiKeySource: 'env', apiKeyMasked: 'enviro…5678', baseUrl: env.OPENAI_BASE_URL });
      context.settings.update({ provider: { type: 'openai-compatible', name: 'Renamed' } });
      const saved = JSON.parse(await readFile(join(home, '.catalyst/config.json'), 'utf8'));
      expect(saved.provider).toMatchObject({ apiKey: 'saved-only-1234', baseUrl: 'http://localhost:1200/v1', name: 'Renamed' });
      env.ANTHROPIC_API_KEY = 'synthetic-other-9412';
      env.CATALYST_PROVIDER = 'anthropic';
      expect(context.settings.get().provider).toMatchObject({ type: 'anthropic', apiKeySource: 'env' });
      env.CATALYST_PROVIDER = 'none';
      expect(context.settings.get().provider).toBeNull();
    } finally {
      await context.close();
    }
  });
  it('refuses symlinked project configuration and dangling index files', async (ctx) => {
    const cfg = join(root, 'catalyst.config.json');
    const outside = join(dir, 'outside.json');
    await writeFile(outside, '{"outputLanguage":"tr"}');
    try {
      await symlink(outside, cfg, 'file');
    } catch (err) {
      if (process.platform === 'win32' && (err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
      throw err;
    }
    expect(() => project.info()).toThrowError(expect.objectContaining({ code: 'BAD_REQUEST' }));
    const sibling = join(dir, 'sibling');
    await mkdir(join(sibling, '.catalyst'), { recursive: true });
    await symlink(join(dir, 'absent.db'), join(sibling, '.catalyst', 'catalyst.db'), 'file');
    await expect(engine.projects.open(sibling)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('keeps environment credentials out of metadata edits and follows rotations', async () => {
    const env = { OPENROUTER_API_KEY: 'synthetic-original-1234' };
    const home = join(dir, 'env-home'),
      context = createEngine({ homeDir: home, env });
    try {
      context.settings.update({
        provider: { type: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' },
      });
      expect(await readFile(join(home, '.catalyst', 'config.json'), 'utf8')).not.toContain(
        env.OPENROUTER_API_KEY,
      );
      env.OPENROUTER_API_KEY = 'synthetic-rotated-9876';
      expect(context.settings.get().provider).toMatchObject({
        apiKeySource: 'env',
        apiKeyMasked: 'synthe…9876',
      });
    } finally {
      await context.close();
    }
  });
  it('publishes the first structural index when the user skips AI', async () => {
    engine.settings.update({
      provider: { type: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', name: 'test' },
    });
    const run = project.index();
    for await (const { event } of run.events()) {
      if (event.stage === 'summarize') {
        run.cancel();
        break;
      }
    }
    expect((await run.done).status).toBe('cancelled');
    expect(project.info()).toMatchObject({
      status: 'ready',
      aiStatus: 'skipped',
      lastRunId: run.id,
    });
    expect(project.query.getOverview('en').entryPoints.length).toBeGreaterThan(0);
    expect(project.query.search('stripe').length).toBeGreaterThan(0);
  });
  it('lets a second engine follow an index and replay its completed events', async () => {
    const other = createEngine({ homeDir: join(dir, 'other-home'), env: {} });
    try {
      const observer = await other.projects.open(root);
      const run = project.index({ ai: false });
      expect(observer.info().activeRunId).toBe(run.id);
      expect(() => observer.index({ ai: false })).toThrowError(
        expect.objectContaining({ code: 'INDEX_RUNNING' }),
      );
      const remote = observer.activeRun()!;
      expect((await remote.done).status).toBe('done');
      const stages = [];
      for await (const { event } of observer.runById!(run.id)!.events(1)) stages.push(event.stage);
      expect(stages.at(-1)).toBe('done');
      expect(observer.query.find('getcu')[0]?.node.name).toBe('getCurrentUser');
      const second = project.index({ ai: false });
      await other.close();
      expect((await second.done).status).toBe('done');
    } finally {
      await other.close();
    }
  });
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
