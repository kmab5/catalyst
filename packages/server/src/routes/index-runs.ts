import { CatalystError, type Project } from '@catalyst/core';
import { IndexRequest } from '@catalyst/shared';
import { Hono } from 'hono';
import { body, integer, type ProjectEnv } from './common.js';
import { sendEvents } from '../sse.js';

function run(project: Project, id: string) {
  const candidate = project.runById?.(id) ?? project.activeRun();
  if (!candidate || candidate.id !== id) throw new CatalystError('PATH_NOT_FOUND', 'Unknown index run');
  return candidate;
}
export function indexRoutes() {
  const app = new Hono<ProjectEnv>();
  app.post('/index', async c => {
    const req = await body(c, IndexRequest, true);
    return c.json({ runId: c.get('project').index(req).id }, 202);
  });
  app.get('/runs/:rid', c => {
    const result = c.get('project').getRun(c.req.param('rid'));
    if (!result) throw new CatalystError('PATH_NOT_FOUND', 'Unknown index run');
    return c.json(result);
  });
  app.post('/runs/:rid/cancel', c => {
    run(c.get('project'), c.req.param('rid')).cancel();
    return c.json({ ok: true });
  });
  app.get('/runs/:rid/events', c => {
    const since = integer(c.req.header('Last-Event-ID'), 0, Number.MAX_SAFE_INTEGER);
    const iterator = run(c.get('project'), c.req.param('rid')).events(since)[Symbol.asyncIterator]();
    return sendEvents(c, iterator, ({ id, event }) => ({
      id: String(id), event: event.stage === 'cancelled' ? 'done' : event.stage === 'done' || event.stage === 'error' ? event.stage : 'progress', data: event,
    }), new AbortController());
  });
  return app;
}
