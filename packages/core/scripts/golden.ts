// Opt-in acceptance check. Run only against a public testbed with an explicitly configured provider.
import { createEngine } from '../src/engine.js';
import { AskAnswer, Feature, OverviewDTO, XRayDTO } from '@catalyst/shared';
import { performance } from 'node:perf_hooks';
const [root, mode = 'index'] = process.argv.slice(2);
if (!root) throw new Error('Pass a public testbed path');
const engine = createEngine();
try {
  const p = await engine.projects.open(root);
  if (mode !== 'ask') {
    const started = performance.now(),
      run = p.index({ ai: mode !== 'structural', budgetUsd: 2, concurrency: 12 });
    let last = '';
    for await (const { event } of run.events()) {
      if (event.stage !== last || event.degraded || (event.done % 25 === 0 && event.done > 0)) {
        console.error(
          event.stage,
          event.done,
          event.total,
          Math.round((performance.now() - started) / 1000) + 's',
        );
        last = event.stage;
      }
    }
    const r = await run.done;
    console.log(
      JSON.stringify({
        project: p.name,
        status: r.status,
        aiStatus: p.info().aiStatus,
        elapsedMs: Math.round(performance.now() - started),
        stats: r.stats,
        error: r.error,
      }),
    );
    if (r.status !== 'done') throw new Error('Index failed');
  }
  const q = p.query,
    overview = OverviewDTO.parse(q.getOverview('en'));
  const features = overview.features.map((f) => Feature.parse(q.getFeature(f.id, 'en')));
  console.log(
    JSON.stringify({
      overview: overview.overview?.oneLiner,
      features: features.map((f) => f.name),
      routes: q.routes().map((n) => n.id),
      models: q.listNodes({ kinds: ['db_model'] }).map((n) => n.id),
      health: overview.health.high,
    }),
  );
  if (p.name === 'taxonomy') {
    const session = q.find('getCurrentUser', { kinds: ['symbol'] })[0];
    if (session) {
      const x = XRayDTO.parse(q.getXRay(session.node.id, 'en'));
      console.log(
        JSON.stringify({
          session: x.node.id,
          summary: x.symbolPurpose,
          dependants: x.impactPreview.dependants,
          routes: x.impactPreview.routes,
        }),
      );
    }
    if (mode === 'ask')
      for (const question of [
        'Where do we handle Stripe webhooks?',
        'Do we have password reset?',
      ]) {
        for await (const event of p.ask({ question })) {
          if (event.type === 'done') {
            const a = AskAnswer.parse(event.answer);
            console.log(
              JSON.stringify({
                question,
                found: a.found,
                citations: a.citations.map((n) => n.id),
                searched: a.searched,
              }),
            );
          } else if (event.type === 'error') {
            console.log(JSON.stringify({ question, error: event.message }));
            process.exitCode = 1;
          }
        }
      }
  }
} finally {
  await engine.close();
}
