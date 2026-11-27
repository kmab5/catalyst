import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { CatalystError } from '@catalyst/core';
import { DiffImpactDTO, EstimateDTO, HealthResponse, ids } from '@catalyst/shared';
import { testEngine } from './test-engine.js';
import { createApp } from './app.js';
import { startServer } from './start.js';

const token = 'test-token';
const headers = { 'X-Catalyst-Token': token };
const setup = () => { const fixture = testEngine(); return { ...fixture, app: createApp(fixture.engine, { token }) }; };

test('global reads, protected settings and project mutations', async () => {
  const { app, project } = setup();
  expect(HealthResponse.parse(await (await app.request('/api/health')).json()).mock).toBe(false);
  for (const [path, method] of [['/api/settings','GET'],['/api/settings/test-provider','POST'],['/api/projects','POST'],['/api/projects/p','DELETE']] as const) {
    expect((await app.request(path, { method })).status).toBe(401);
  }
  expect((await app.request('/api/settings', { headers })).status).toBe(200);
  expect(await (await app.request('/api/projects', { method: 'POST', headers, body: JSON.stringify({ path: '/repos/taxonomy' }) })).json()).toEqual(project.info());
  const res = await app.request('/api/projects/p/index', { method: 'POST', headers });
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ runId: 'r' });
  expect(project.index).toHaveBeenCalledWith({ mode: 'incremental', ai: true });
  expect((await app.request('/api/projects/p/runs/r')).status).toBe(200);
});
test('invalid JSON, enums, ranges, ids and unknown project return contract errors', async () => {
  const { app } = setup();
  for (const suffix of ['/tree?depth=-2','/nodes/id/impact?direction=around','/graph?nodeKinds=unknown','/find?q=','/nodes/id/source?start=10&end=2','/nodes/%ZZ','/runs/r/events']) {
    const res = await app.request('/api/projects/p' + suffix, { headers: { 'Last-Event-ID': '-1' } });
    expect(res.status, suffix).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
  }
  expect((await app.request('/api/projects', { method: 'POST', headers, body: '{' })).status).toBe(400);
  expect(await (await app.request('/api/projects/missing/overview')).json()).toMatchObject({ error: { code: 'PROJECT_NOT_FOUND' } });
  expect((await app.request('/api/projects/p/runs/not-here')).status).toBe(404);
});
test('encoded node IDs decode once and project reads include the index version', async () => {
  const { app, query } = setup();
  const id = ids.sym('app/(dashboard)/[id]/%20page.tsx', 'default');
  const response = await app.request('/api/projects/p/nodes/' + encodeURIComponent(id) + '?lang=tr');
  expect(response.status).toBe(200);
  expect(query.getXRay).toHaveBeenCalledWith(id, 'tr');
  expect(response.headers.get('X-Catalyst-Index')).toBe('r');
});
test('run events resume after the last event id and close at done', async () => {
  const { app } = setup();
  const path = '/api/projects/p/runs/r/events';
  const res = await app.request(path, { headers: { 'Last-Event-ID': '1' } });
  expect(res.headers.get('Content-Type')).toMatch(/text\/event-stream/);
  const content = await res.text();
  expect(content).not.toMatch(/id: 1\n/);
  expect(content).toMatch(/event: progress[\s\S]*id: 2[\s\S]*event: done[\s\S]*id: 3/);
  expect(await (await app.request(path, { headers: { 'Last-Event-ID': '3' } })).text()).toBe('');
});
test('Ask streams done, reports setup errors through HTTP and redacts provider failures', async () => {
  const { app, project } = setup();
  const req = () => app.request('/api/projects/p/ask', { method: 'POST', headers, body: JSON.stringify({ question: 'Where is billing?' }) });
  expect(await (await req()).text()).toContain('event: done');
  project.ask = async function* () { throw new CatalystError('AI_NOT_CONFIGURED','Select a provider'); };
  expect((await req()).status).toBe(412);
  project.ask = async function* () { yield { type: 'thinking', text: 'Checking' }; throw new CatalystError('PROVIDER_ERROR', 'Bad key sk-very-secret-value'); };
  const content = await (await req()).text();
  expect(content).toMatch(/event: error/);
  expect(content).not.toContain('very-secret');
});
test('static assets, deep links, escaped tokens and unknown API paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalyst-ui-'));
  try {
    await writeFile(join(dir, 'index.html'), '<html><head></head><body>app</body></html>');
    await writeFile(join(dir, 'app.js'), 'window.loaded = true;');
    const app = createApp(testEngine().engine, { staticDir: dir, token: '"<token>' });
    const res = await app.request('/p/a/overview');
    expect(await res.text()).toContain('<meta name="catalyst-token" content="&quot;&lt;token&gt;"></head>');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await (await app.request('/app.js')).text()).toBe('window.loaded = true;');
    expect((await app.request('/api/unknown')).status).toBe(404);
    expect((await app.request('/..%2Foutside')).status).toBe(404);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('occupied port advances to a free local listener', async () => {
  const { engine } = setup();
  const first = await startServer(engine, { port: 0 });
  try {
    const second = await startServer(engine, { port: first.port });
    try {
      expect(second.port).toBeGreaterThan(first.port);
      expect(second.port).toBeLessThanOrEqual(first.port + 20);
      expect(second.token).toMatch(/^[a-f0-9]{64}$/);
      expect((await fetch(second.url + '/api/health')).status).toBe(200);
    } finally { await second.close(); }
  } finally { await first.close(); }
});
test('estimate and diff use the project and respect the narrative toggle', async () => {
  const { app } = setup();
  const post = (path: string, body = '{}') => app.request('/api/projects/p/' + path, { method: 'POST', headers, body });
  expect(EstimateDTO.safeParse(await (await post('estimate')).json()).success).toBe(true);
  expect(DiffImpactDTO.parse(await (await post('impact/diff')).json()).narrative).toContain('billing');
  expect(DiffImpactDTO.parse(await (await post('impact/diff', '{"narrative":false}')).json()).narrative).toBeNull();
});

test('Impact returns a useful empty comparison for an indexed folder without Git', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalyst-impact-'));
  const { createEngine } = await import('@catalyst/core');
  const engine = createEngine({ homeDir: join(dir, 'home'), env: {} });
  try {
    const project = await engine.projects.open(dir);
    await project.index({ ai: false }).done;
    const app = createApp(engine, { token });
    const res = await app.request('/api/projects/' + project.info().id + '/impact/diff', {
      method: 'POST', headers, body: '{"narrative":false,"lang":"en"}',
    });
    expect(res.status).toBe(200);
    expect(DiffImpactDTO.parse(await res.json())).toMatchObject({
      unavailable: 'not-a-work-tree', changedFiles: [], narrative: null,
    });
  } finally {
    await engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});
