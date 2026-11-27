import { AskRequest, NodeKind } from '@catalyst/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { body, csv, integer, type ProjectEnv } from './common.js';
import { sendEvents } from '../sse.js';

export function searchRoutes() {
  const app = new Hono<ProjectEnv>();
  const queryText = z.string().trim().min(1);
  app.get('/find', c => c.json(c.get('project').query.find(queryText.parse(c.req.query('q')), {
    kinds: csv(c.req.query('kinds'), NodeKind), limit: integer(c.req.query('limit'), 1, 500) ?? 20,
  })));
  app.get('/search', c => c.json(c.get('project').query.search(queryText.parse(c.req.query('q')), {
    kind: NodeKind.optional().parse(c.req.query('kind')), limit: integer(c.req.query('limit'), 1, 500) ?? 30,
  })));
  app.get('/asks', c => c.json(c.get('project').asks?.() ?? []));
  app.post('/ask', async c => {
    const request = await body(c, AskRequest);
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, c.req.raw.signal]);
    const iterator = c.get('project').ask(request, signal)[Symbol.asyncIterator]();
    const first = await iterator.next();
    return sendEvents(c, iterator, item => ({ event: item.type, data: item }), controller, first);
  });
  return app;
}
