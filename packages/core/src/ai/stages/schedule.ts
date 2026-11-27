/** Run ready jobs immediately, preserving dependency ordering even when a sibling is slow. */
export async function runReady<T>(
  jobs: T[],
  prerequisites: (job: T) => Iterable<T>,
  concurrency: number,
  execute: (job: T) => Promise<unknown>,
) {
  const counts = new Map<T, number>(),
    dependants = new Map<T, T[]>(),
    ready: T[] = [];
  for (const job of jobs) {
    const dependencies = new Set(prerequisites(job));
    dependencies.delete(job);
    counts.set(job, dependencies.size);
    if (!dependencies.size) ready.push(job);
    for (const dependency of dependencies) {
      const next = dependants.get(dependency);
      if (next) next.push(job);
      else dependants.set(dependency, [job]);
    }
  }
  const running = new Map<T, Promise<T>>();
  let cursor = 0,
    completed = 0;
  try {
    while (cursor < ready.length || running.size) {
      while (cursor < ready.length && running.size < concurrency) {
        const job = ready[cursor++]!;
        running.set(
          job,
          execute(job).then(() => job),
        );
      }
      const job = await Promise.race(running.values());
      running.delete(job);
      completed++;
      for (const next of dependants.get(job) ?? []) {
        const remaining = counts.get(next)! - 1;
        counts.set(next, remaining);
        if (!remaining) ready.push(next);
      }
    }
    if (completed !== jobs.length) throw new Error('Unexpected cycle in AI stage dependencies');
  } finally {
    // No queued source reads or DB writes may outlive their index run on cancellation.
    await Promise.allSettled(running.values());
  }
}
