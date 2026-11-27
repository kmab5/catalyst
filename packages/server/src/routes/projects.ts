import { CatalystError, type Engine } from '@catalyst/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { indexRoutes } from './index-runs.js';
import { healthRoutes } from './health.js';
import { readRoutes } from './read.js';
import { searchRoutes } from './search.js';
import type { ProjectEnv } from './common.js';

export function projectRoutes(engine: Engine) {
  const app = new Hono<ProjectEnv>();
  app.use('*', async (c, next) => {
    const id = c.req.param('pid')!;
    const project = engine.projects.get(id);
    if (!project) throw new CatalystError('PROJECT_NOT_FOUND', 'Unknown project');
    c.set('project', project);
    c.header('X-Catalyst-Index', project.info().lastRunId ?? '');
    await next();
  });
  app.get('/', c => c.json(c.get('project').info()));
  app.delete('/', async c => {
    const purge = z.enum(['true','false']).optional().parse(c.req.query('purge')) === 'true';
    await engine.projects.forget(c.get('project').id, { purge });
    return c.json({ ok: true });
  });
  return app.route('/', indexRoutes()).route('/', healthRoutes()).route('/', readRoutes()).route('/', searchRoutes());
}
