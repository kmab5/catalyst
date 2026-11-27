import { CatalystError, type Engine } from '@catalyst/core';
import { Hono } from 'hono';
import { publicError } from './errors.js';
import { matchesToken } from './token.js';
import { globalRoutes } from './routes/global.js';
import { projectRoutes } from './routes/projects.js';
import { serveUi } from './static.js';

export function createApp(engine: Engine, opts: { token: string; staticDir?: string }): Hono {
  const app = new Hono();
  app.onError((err, c) => {
    const { body, status } = publicError(err);
    return c.json(body, status);
  });
  app.use('*', async (c, next) => {
    try { decodeURIComponent(c.req.path); }
    catch { throw new CatalystError('BAD_REQUEST', 'Invalid URL encoding'); }
    const { path, method } = c.req;
    const canonical = decodeURIComponent(path).toLowerCase();
    if ((method !== 'GET' || canonical.startsWith('/api/settings')) && !matchesToken(opts.token, c.req.header('X-Catalyst-Token'))) {
      throw new CatalystError('UNAUTHORIZED', 'A valid Catalyst token is required');
    }
    await next();
  });
  app.route('/api', globalRoutes(engine));
  app.route('/api/projects/:pid', projectRoutes(engine));
  app.all('/api/*', () => { throw new CatalystError('PATH_NOT_FOUND', 'Unknown API endpoint'); });
  app.get('*', c => serveUi(c, opts.staticDir, opts.token));
  return app;
}
