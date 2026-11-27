import { CatalystError } from '@catalyst/core';
import { DiffImpactRequest, Lang, Severity, type DiffImpactDTO } from '@catalyst/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { body, type ProjectEnv } from './common.js';

export function healthRoutes() {
  const app = new Hono<ProjectEnv>();
  app.get('/health', c => c.json(c.get('project').query.getHealth({
    severity: Severity.optional().parse(c.req.query('severity')), featureId: c.req.query('feature'), rule: c.req.query('rule'),
  })));
  app.post('/impact/diff', async c => {
    const { base, narrative, lang } = await body(c, DiffImpactRequest, true);
    const project = c.get('project');
    const impact: DiffImpactDTO = { ...await project.query.diffImpact({ base }), narrative: null };
    if (narrative && impact.changedFiles.length && project.diffNarrative) impact.narrative = await project.diffNarrative(impact, lang);
    return c.json(impact);
  });
  app.post('/estimate', async c => {
    const { language } = await body(c, z.object({ language: Lang.optional() }), true);
    const project = c.get('project');
    if (!project.estimate) throw new CatalystError('NOT_IMPLEMENTED', 'Estimate unavailable');
    return c.json(project.estimate(language));
  });
  return app;
}
