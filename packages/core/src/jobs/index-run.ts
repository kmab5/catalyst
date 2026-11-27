import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { ProgressEvent, RunDTO } from '@catalyst/shared';
import type { IndexRun } from '../engine.js';
import type { Store } from '../store/index.js';
import { CatalystError } from '../errors.js';

export type Report = (
  stage: ProgressEvent['stage'],
  done: number,
  total: number,
  message?: string,
  degraded?: boolean,
) => void;
type Stats = NonNullable<RunDTO['stats']>;
export function activeOwner(store: Store): string | null {
  const raw = store.meta.get('run_owner');
  if (!raw) return null;
  const lease = JSON.parse(raw) as { pid: number; id: string };
  try {
    process.kill(lease.pid, 0);
    return lease.id;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ESRCH') return lease.id;
  }
  store.db
    .transaction(() => {
      if (store.meta.get('run_owner') !== raw) return;
      const old = store.run(lease.id);
      if (old?.status === 'running') {
        const error = 'Indexing process stopped before completion';
        const event: ProgressEvent = {
          runId: old.id,
          stage: 'error',
          done: 1,
          total: 1,
          message: error,
        };
        store
          .stmt(
            'INSERT INTO run_events SELECT ?,COALESCE(MAX(seq),0)+1,? FROM run_events WHERE run_id=?',
          )
          .run(old.id, JSON.stringify(event), old.id);
        store.saveRun({ ...old, status: 'error', error, lastEvent: event, finishedAt: Date.now() });
        store.meta.set('last_status', 'error');
      }
      store.stmt("DELETE FROM meta WHERE key='run_owner'").run();
    })
    .immediate();
  return null;
}

export function storedRun(store: Store, id: string): IndexRun | undefined {
  if (!store.run(id)) return;
  async function* events(since = 0) {
    for (;;) {
      activeOwner(store);
      const run = store.run(id);
      const rows = store.all<{ seq: number; event: string }>(
        'SELECT seq,event FROM run_events WHERE run_id=? AND seq>? ORDER BY seq',
        id,
        since,
      );
      for (const row of rows) {
        since = row.seq;
        yield { id: row.seq, event: JSON.parse(row.event) as ProgressEvent };
      }
      if (!run || run.status !== 'running') break;
      await delay(200);
    }
  }
  return {
    id,
    events,
    get done() {
      return (async () => {
        for await (const _ of events()) {
        }
        return store.run(id)!;
      })();
    },
    cancel() {
      if (activeOwner(store) === id) store.meta.set('cancel_run', id);
    },
  };
}
export function startIndexRun(
  store: Store,
  work: (signal: AbortSignal, report: Report, stats: Stats) => Promise<void>,
  finished: (run: RunDTO) => void,
): IndexRun {
  const id = randomUUID(),
    controller = new AbortController(),
    listeners = new Set<() => void>();
  const history: { id: number; event: ProgressEvent }[] = [];
  let seq = 0,
    terminal = false,
    stageStarted = Date.now();
  const stats: Stats = {
    stageMs: {},
    tokens: { in: 0, out: 0 },
    llmCalls: 0,
    cacheHits: 0,
    costUsdEstimate: null,
  };
  const run: RunDTO = {
    id,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    lastEvent: null,
    stats,
    error: null,
  };
  store.db
    .transaction(() => {
      const owner = activeOwner(store);
      if (owner)
        throw new CatalystError('INDEX_RUNNING', 'Another process is indexing this project', {
          runId: owner,
        });
      store.meta.set('run_owner', JSON.stringify({ pid: process.pid, id }));
      store.saveRun(run);
    })
    .immediate();
  const report: Report = (stage, done, total, message, degraded) => {
    const previous = run.lastEvent?.stage;
    if (previous !== stage) {
      if (previous)
        stats.stageMs[previous] = (stats.stageMs[previous] ?? 0) + Date.now() - stageStarted;
      stageStarted = Date.now();
    }
    const event: ProgressEvent = { runId: id, stage, done, total, message, degraded };
    history.push({ id: ++seq, event });
    if (history.length > 500) history.shift();
    run.lastEvent = event;
    store.db.transaction(() => {
      store.stmt('INSERT INTO run_events VALUES(?,?,?)').run(id, seq, JSON.stringify(event));
      if (seq > 500)
        store.stmt('DELETE FROM run_events WHERE run_id=? AND seq=?').run(id, seq - 500);
      store.saveRun(run);
    })();
    for (const wake of listeners) wake();
    listeners.clear();
  };
  const poll = setInterval(() => {
    if (store.meta.get('cancel_run') === id) controller.abort();
  }, 200);
  poll.unref();
  const done = Promise.resolve().then(async () => {
    try {
      await work(controller.signal, report, stats);
      controller.signal.throwIfAborted();
      run.status = 'done';
    } catch (err) {
      run.status = controller.signal.aborted ? 'cancelled' : 'error';
      run.error = err instanceof Error ? err.message : 'Indexing failed';
    }
    run.finishedAt = Date.now();
    terminal = true;
    try {
      report(run.status, 1, 1, run.error ?? undefined);
      finished(run);
    } finally {
      clearInterval(poll);
      store.stmt("DELETE FROM meta WHERE key='cancel_run' AND value=?").run(id);
      store
        .stmt("DELETE FROM meta WHERE key='run_owner' AND value=?")
        .run(JSON.stringify({ pid: process.pid, id }));
    }
    return run;
  });
  return {
    id,
    done,
    cancel: () => controller.abort(),
    events(since = 0) {
      // A pending next() can be abandoned when an SSE client disconnects.
      let cursor = since,
        closed = false,
        notify: (() => void) | undefined;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              while (!closed) {
                const item = history.find((e) => e.id > cursor);
                if (item) {
                  cursor = item.id;
                  return { done: false as const, value: item };
                }
                if (terminal) break;
                await new Promise<void>((resolve) => {
                  notify = resolve;
                  listeners.add(resolve);
                });
              }
              return { done: true as const, value: undefined };
            },
            async return() {
              closed = true;
              if (notify) {
                listeners.delete(notify);
                notify();
              }
              return { done: true as const, value: undefined };
            },
          };
        },
      };
    },
  };
}
