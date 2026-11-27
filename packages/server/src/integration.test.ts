import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '@catalyst/core';
import { ProjectDTO, RunDTO, SearchResultDTO, XRayDTO, ids } from '@catalyst/shared';
import { expect, test } from 'vitest';
import { createApp } from './app.js';

test('a new engine opens, indexes, streams and queries a project over HTTP', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'catalyst-api-'));
  const home = join(temp, 'home');
  const repo = join(temp, 'repo');
  await mkdir(home);
  const fixture = fileURLToPath(new URL('../../../fixtures/repos/ts-basic', import.meta.url));
  await cp(fixture, repo, { recursive: true, filter: path => !/(^|[\\/])\.catalyst$/.test(path) });
  const engine = createEngine({ homeDir: home, env: {} });
  try {
    const app = createApp(engine, { token: 'local' });
    const post = (path: string, input: unknown) => app.request(path, { method: 'POST', headers: { 'X-Catalyst-Token': 'local' }, body: JSON.stringify(input) });
    const opened = ProjectDTO.parse(await (await post('/api/projects', {path:repo})).json());
    const base = '/api/projects/' + opened.id;
    const started = await post(base + '/index', { ai: false });
    expect(started.status).toBe(202);
    const { runId } = await started.json() as {runId:string};
    const events = await (await app.request(base + '/runs/' + runId + '/events')).text();
    expect(events).toContain('event: done');
    const run = RunDTO.parse(await (await app.request(base + '/runs/' + runId)).json());
    expect(run.status).toBe('done');
    const xray = await app.request(base + '/nodes/' + encodeURIComponent(ids.file('lib/session.ts')));
    expect(xray.headers.get('X-Catalyst-Index')).toBe(runId);
    expect(XRayDTO.parse(await xray.json()).node.filePath).toBe('lib/session.ts');
    const matches = SearchResultDTO.array().parse(await (await app.request(base + '/search?q=session')).json());
    expect(matches.length).toBeGreaterThan(0);
  } finally { await engine.close(); await rm(temp, { recursive: true, force: true }); }
}, 30_000);
