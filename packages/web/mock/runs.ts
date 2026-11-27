import type { ProgressEvent, ProjectDTO, RunDTO } from '../src/api/contract';
import type { FixtureIndex } from './fixture-schema';

interface DemoRun {
  project: ProjectDTO;
  record: RunDTO;
  events: ProgressEvent[];
  ai: boolean;
}
const sessions = new WeakMap<FixtureIndex, Map<string, DemoRun>>();
export const frameDelayMs = 120;

export function runsFor(fixture: FixtureIndex) {
  let runs = sessions.get(fixture);
  if (!runs) {
    runs = new Map();
    const project = fixture.projects.find((p) => p.lastRunId === fixture.run.id);
    if (project)
      runs.set(fixture.run.id, {
        project,
        record: fixture.run,
        events: fixture.runEvents,
        ai: true,
      });
    sessions.set(fixture, runs);
  }
  for (const run of runs.values()) {
    if (
      run.record.status === 'running' &&
      Date.now() >= run.record.startedAt + (run.events.length - 1) * frameDelayMs
    ) {
      finishRun(run);
    }
  }
  return runs;
}

export function finishRun(run: DemoRun, cancelled = false) {
  if (run.record.status !== 'running') return;
  const now = Date.now();
  if (cancelled) {
    const delivered = Math.floor((now - run.record.startedAt) / frameDelayMs) + 1;
    run.events.splice(delivered, Infinity, {
      runId: run.record.id,
      stage: 'cancelled',
      done: 0,
      total: 0,
    });
  }
  run.record.status = cancelled ? 'cancelled' : 'done';
  run.record.finishedAt = now;
  run.record.lastEvent = run.events.at(-1) ?? null;
  run.project.activeRunId = null;
  run.project.status = 'ready';
  run.project.lastIndexedAt = now;
  run.project.lastRunId = run.record.id;
  run.project.aiStatus = run.ai ? (cancelled ? 'partial' : 'done') : 'skipped';
}

export function startDemoRun(f: FixtureIndex, project: ProjectDTO, ai: boolean) {
  const runs = runsFor(f);
  const id = crypto.randomUUID();
  const aiStages = ['summarize', 'rollup', 'features', 'overview', 'changeability'];
  const events = f.runEvents
    .filter((e) => ai || !aiStages.includes(e.stage))
    .map((e) => ({ ...e, runId: id }));
  const record: RunDTO = {
    ...f.run,
    id,
    startedAt: Date.now(),
    finishedAt: null,
    lastEvent: events[0] ?? null,
    status: 'running',
  };
  runs.set(id, { project, record, events, ai });
  project.activeRunId = id;
  project.status = 'indexing';
  return record;
}
