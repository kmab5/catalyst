import { AppOverview, type Feature } from '@catalyst/shared';
import { rows, testFile, type Snapshot } from '../context.js';
import { preamble } from '../prompts/shared.js';
import { cleanStrings } from '../ask/citations.js';
import { hash } from '../client.js';
import type { StageContext } from './summarize.js';
export function gapSignals(s: Snapshot) {
  const nodes = [...s.nodes.values()],
    routes = nodes.filter((n) => n.kind === 'route');
  const signals: string[] = [];
  if (!s.files.some((f) => testFile(f.path))) signals.push('no-tests');
  if (
    routes.some((n) => /^route:(POST|PUT|PATCH|DELETE) /.test(n.id)) &&
    !nodes.some((n) => n.kind === 'service' && /auth|clerk|supabase/i.test(n.id))
  )
    signals.push('no-auth-on-mutating-routes');
  if (!nodes.some((n) => n.kind === 'service' && /sentry|bugsnag|rollbar|honeybadger/i.test(n.id)))
    signals.push('no-error-tracking');
  if (!s.db.prepare("SELECT 1 FROM files WHERE path='.env.example' OR path LIKE '%/.env.example'").get())
    signals.push('no-env-example');
  return signals;
}
export async function overview(features: Feature[], { s, client, attempt }: StageContext) {
  const stackJson = rows<{ value: string }>(s.db, "SELECT value FROM meta WHERE key='stack_json'")[0]
    ?.value;
  const stack = AppOverview.shape.stack.catch([]).parse(stackJson ? JSON.parse(stackJson) : []);
  const routes = [...s.nodes.values()].filter((n) => n.kind === 'route').map((n) => n.id);
  const gaps = gapSignals(s);
  const input = {
    features: features.map(({ id, name, summary, services, dependsOn, entryPoints }) => ({
      id,
      name,
      summary,
      services,
      dependsOn,
      entryPoints,
    })),
    modules: [...s.summaries.values()]
      .filter((r) => !('role' in r.value))
      .sort(
        (a, b) =>
          b.value.nodeId.length - a.value.nodeId.length || a.value.nodeId.localeCompare(b.value.nodeId),
      )
      .slice(-8)
      .map((r) => r.value.purpose),
    routes,
    stack,
    gaps,
    flags: rows(s.db, 'SELECT severity,COUNT(*) AS count FROM flags GROUP BY severity'),
  };
  const result = await attempt('overview', () =>
    client.object('overview', {
      tier: 'smart',
      schema: AppOverview,
      schemaName: 'AppOverview',
      system:
        preamble(s.lang) +
        ' Explain the app, its audience and how its features fit together. Only report gaps supported by the supplied signals.',
      prompt: JSON.stringify(input),
    }),
  );
  if (!result) return;
  const featureIds = new Set(features.map((f) => f.id)),
    routeIds = new Set(routes);
  const value = cleanStrings(
    {
      ...result,
      stack,
      featureIds: result.featureIds.filter((id) => featureIds.has(id)),
      entryPoints: result.entryPoints.filter((id) => routeIds.has(id)),
      gaps: gaps.length ? result.gaps : [],
    },
    (id) => s.nodes.has(id) || featureIds.has(id),
  );
  s.db
    .prepare('INSERT OR REPLACE INTO overview VALUES(?,?,?,?)')
    .run(
      s.lang,
      JSON.stringify(value),
      hash(input, client.provider.modelFor('smart'), s.lang),
      Date.now(),
    );
}
