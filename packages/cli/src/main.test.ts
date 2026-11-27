import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { sampleAskAnswer, sampleHealthDTO, sampleNodeRef, sampleRunDTO } from '@catalyst/shared';
import { fakeCli } from '../test/fake-engine.js';
import { run } from './main.js';

let f: ReturnType<typeof fakeCli>;
beforeEach(() => {
  f = fakeCli();
});
afterEach(() => f.cleanup());
test('non-project cwd opens launcher and prints the actual port without launch secrets', async () => {
  expect(await run(f.deps, [])).toBe(0);
  expect(f.openBrowser).toHaveBeenCalledWith('http://127.0.0.1:4322/');
  expect(f.stdout.text).toBe('http://127.0.0.1:4322/\n');
});
test('subdirectory opens the launcher with a project suggestion', async () => {
  f.deps.cwd = join(f.root, 'src');
  await run(f.deps, []);
  expect(new URL(f.openBrowser.mock.calls[0]![0]).searchParams.get('suggest')).toBe(f.root);
  expect(f.engine.projects.open).not.toHaveBeenCalled();
});
test('never-indexed starts once and opens indexing', async () => {
  f.info.status = 'never-indexed';
  expect(await run(f.deps, [f.root])).toBe(0);
  expect(f.index).toHaveBeenCalledOnce();
  expect(f.openBrowser.mock.calls[0]![0]).toMatch(/\/p\/[a-f0-9]{12}\/indexing$/);
});
test('ready project opens overview without indexing', async () => {
  expect(await run(f.deps, [f.root])).toBe(0);
  expect(f.index).not.toHaveBeenCalled();
  expect(f.openBrowser.mock.calls[0]![0]).toMatch(/\/overview$/);
});
test('ui always opens launcher, even in project root', async () => {
  f.deps.cwd = f.root;
  expect(await run(f.deps, ['ui'])).toBe(0);
  expect(new URL(f.openBrowser.mock.calls[0]![0]).searchParams.get('suggest')).toBe(f.root);
});
test('serve --no-open starts no index and leaves the browser closed', async () => {
  f.info.status = 'stale';
  expect(await run(f.deps, ['serve', f.root, '--no-open'])).toBe(0);
  expect(f.openBrowser).not.toHaveBeenCalled();
  expect(f.index).not.toHaveBeenCalled();
});
test('missing path exits 3 and disposes engine', async () => {
  expect(await run(f.deps, [join(f.root, 'missing')])).toBe(3);
  expect(f.engine.close).toHaveBeenCalledOnce();
});
test('JSON indexing separates progress from result and passes per-run options', async () => {
  expect(
    await run(f.deps, [
      'index',
      f.root,
      '--json',
      '--no-ai',
      '--force',
      '--budget',
      '1.5',
      '--lang',
      'tr',
      '--concurrency',
      '3',
    ]),
  ).toBe(0);
  expect(f.index).toHaveBeenCalledWith({
    mode: 'full',
    ai: false,
    budgetUsd: 1.5,
    language: 'tr',
    concurrency: 3,
  });
  expect(JSON.parse(f.stdout.text)).toEqual(sampleRunDTO);
  expect(f.stderr.text).toContain('[catalyst] parse');
});
test('first run without a provider indexes structure and prints setup instructions', async () => {
  f.settings.provider = null;
  expect(await run(f.deps, ['index', f.root])).toBe(0);
  expect(f.index.mock.calls[0]?.[0]?.ai).toBe(false);
  expect(f.stderr.text).toContain('No AI provider configured');
});
test('ask requires an index and then a provider', async () => {
  f.info.lastIndexedAt = null;
  expect(await run(f.deps, ['ask', 'Where?', f.root])).toBe(3);
  f.info.lastIndexedAt = 10;
  f.settings.provider = null;
  expect(await run(f.deps, ['ask', 'Where?', f.root])).toBe(4);
});
test('ask renders negative evidence', async () => {
  f.setAnswer({ ...sampleAskAnswer, found: false, searched: ['routes', 'session', 'reset'] });
  expect(await run(f.deps, ['ask', 'Password reset?', f.root])).toBe(0);
  expect(f.stdout.text).toContain('Not found.\nChecked:\n  routes');
});
test('MCP keeps stdout reserved for frames', async () => {
  expect(await run(f.deps, ['mcp', f.root])).toBe(0);
  expect(f.startMcp).toHaveBeenCalledWith(f.engine, f.root);
  expect(f.stdout.text.length).toBe(0);
});
test('health prints a closed cycle and supports CI exit codes', async () => {
  f.query.getHealth = () => ({
    ...sampleHealthDTO,
    cycles: [
      {
        id: 'c',
        size: 2,
        nodes: [
          { ...sampleNodeRef, filePath: 'a.ts' },
          { ...sampleNodeRef, filePath: 'b.ts' },
        ],
      },
    ],
  });
  expect(await run(f.deps, ['health', f.root, '--fail-on', 'warn'])).toBe(1);
  expect(f.stdout.text).toContain('a.ts → b.ts → a.ts');
});
test('structural diff works without AI', async () => {
  f.settings.provider = null;
  expect(await run(f.deps, ['impact', f.root, '--no-narrative', '--json'])).toBe(0);
  expect(JSON.parse(f.stdout.text).affected.features[0].name).toBe('Billing');
});
test('invalid config diagnostics omit supplied secrets', async () => {
  expect(await run(f.deps, ['config', 'set', 'wrong', 'secret-value'])).toBe(2);
  expect(f.stderr.text).not.toContain('secret-value');
  expect(f.engine.settings.update).not.toHaveBeenCalled();
});
test('bad args fail before creating the engine', async () => {
  const createEngine = vi.spyOn(f.deps, 'createEngine');
  expect(await run(f.deps, ['index', f.root, '--concurrency', '99'])).toBe(2);
  expect(createEngine).not.toHaveBeenCalled();
});

test('a browser-started index is cancelled on the first interrupt', async () => {
  const controller = new AbortController();
  f.info.activeRunId = f.indexRun.id;
  const project = f.engine.projects.get(f.info.id)!;
  project.activeRun = () => f.indexRun;
  f.deps.signal = controller.signal;
  f.deps.waitForStop = async () => {
    controller.abort();
  };
  expect(await run(f.deps, ['ui', '--no-open'])).toBe(130);
  expect(f.indexRun.cancel).toHaveBeenCalledOnce();
});

test('interactive provider selection tests a new key before saving', async () => {
  f.settings.provider = null;
  const prompt = vi.fn().mockResolvedValueOnce('anthropic').mockResolvedValueOnce('test-secret');
  f.deps.prompt = prompt;
  const testConnection = vi.spyOn(f.engine.settings, 'test');
  expect(await run(f.deps, ['config', 'provider'])).toBe(0);
  expect(prompt).toHaveBeenCalledWith(expect.stringContaining('hidden'), true);
  expect(testConnection).toHaveBeenCalledWith({ type: 'anthropic', apiKey: 'test-secret' });
  expect(f.engine.settings.update).toHaveBeenCalledWith({
    provider: { type: 'anthropic', apiKey: 'test-secret' },
  });
  expect(f.stdout.text + f.stderr.text).not.toContain('test-secret');
});

test('testing a saved provider does not replace stored credentials', async () => {
  f.deps.prompt = vi.fn().mockResolvedValue('');
  const testConnection = vi.spyOn(f.engine.settings, 'test');
  expect(await run(f.deps, ['config', 'provider'])).toBe(0);
  expect(testConnection).toHaveBeenCalledWith(undefined);
  expect(f.engine.settings.update).not.toHaveBeenCalled();
});

test('failed provider test leaves existing settings intact', async () => {
  f.deps.prompt = vi.fn().mockResolvedValueOnce('anthropic').mockResolvedValueOnce('placeholder');
  f.engine.settings.test = async () => ({ ok: false, model: '', latencyMs: 0 });
  expect(await run(f.deps, ['config', 'provider'])).toBe(5);
  expect(f.engine.settings.update).not.toHaveBeenCalled();
});

test('version and help do not open the engine', async () => {
  const create = vi.spyOn(f.deps, 'createEngine');
  expect(await run(f.deps, ['--version'])).toBe(0);
  expect(await run(f.deps, ['--help'])).toBe(0);
  expect(create).not.toHaveBeenCalled();
});
