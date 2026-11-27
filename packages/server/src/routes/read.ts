import { EdgeKind, GraphQuery, NodeKind, Provenance } from '@catalyst/shared';
import { CatalystError } from '@catalyst/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { csv, integer, language, type ProjectEnv } from './common.js';

export function readRoutes() {
  const app = new Hono<ProjectEnv>();
  app.get('/overview', c => c.json(c.get('project').query.getOverview(language(c))));
  app.get('/features', c => c.json(c.get('project').query.listFeatures(language(c))));
  app.get('/features/:fid', c => c.json(c.get('project').query.getFeature(c.req.param('fid'), language(c))));
  app.get('/tree', c => c.json(c.get('project').query.getTree(c.req.query('path'), integer(c.req.query('depth'), 0, Number.MAX_SAFE_INTEGER))));
  app.get('/nodes/:id', c => c.json(c.get('project').query.getXRay(c.req.param('id'), language(c))));
  app.get('/nodes/:id/source', async c => {
    const q = c.get('project').query;
    const id = c.req.param('id');
    const start = integer(c.req.query('start'), 1, Number.MAX_SAFE_INTEGER);
    const end = integer(c.req.query('end'), 1, Number.MAX_SAFE_INTEGER);
    let range;
    if (start !== undefined || end !== undefined) {
      const node = q.getNode(id);
      const first = start ?? node.startLine ?? 1;
      const last = end ?? node.endLine ?? (first + 1999);
      if (last < first) throw new CatalystError('BAD_REQUEST', 'End must follow start');
      range = { start: first, end: Math.min(last, first + 1999) };
    }
    return c.json(await q.getSource(id, range));
  });
  app.get('/nodes/:id/impact', c => c.json(c.get('project').query.impact(c.req.param('id'), {
    direction: z.enum(['up','down','both']).default('both').parse(c.req.query('direction')),
    depth: integer(c.req.query('depth'), 1, 6) ?? 3, edgeKinds: csv(c.req.query('kinds'), EdgeKind),
  })));
  app.get('/graph', c => c.json(c.get('project').query.graph(GraphQuery.parse({
    ...c.req.query(), depth: integer(c.req.query('depth'), 0, Number.MAX_SAFE_INTEGER),
    limit: integer(c.req.query('limit'), 1, 500), edgeKinds: csv(c.req.query('edgeKinds'), EdgeKind),
    nodeKinds: csv(c.req.query('nodeKinds'), NodeKind), provenance: csv(c.req.query('provenance'), Provenance),
  }))));
  return app;
}
