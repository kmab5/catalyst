import type { Engine } from '@catalyst/core';
import { ProviderConfig, SettingsUpdate } from '@catalyst/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { body } from './common.js';

export function globalRoutes(engine: Engine) {
  const app = new Hono();
  app.get('/health', c => c.json({ ok: true, version: '0.1.0', mock: false }));
  app.get('/settings', c => c.json(engine.settings.get()));
  app.put('/settings', async c => c.json(engine.settings.update(await body(c, SettingsUpdate))));
  app.post('/settings/test-provider', async c => {
    const { provider } = await body(c, z.object({ provider: ProviderConfig.optional() }), true);
    return c.json(await engine.settings.test(provider));
  });
  app.get('/providers/detect', async c => c.json(await engine.settings.detect()));
  app.get('/fs/browse', c => c.json(engine.browse(c.req.query('path'))));
  app.get('/projects', c => c.json(engine.projects.list()));
  app.post('/projects', async c => {
    const { path } = await body(c, z.object({ path: z.string().min(1) }));
    return c.json((await engine.projects.open(path)).info());
  });
  return app;
}
