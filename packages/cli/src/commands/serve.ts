import type { Engine } from '@catalyst/core';
import { isIP } from 'node:net';
import { directory, openProject, projectAncestor, type CliDeps } from '../context.js';
import { EXIT } from '../exit-codes.js';
import { launchUrl } from '../urls.js';
import { printProjectHeader } from '../progress.js';
import { indexOptions, observeRun, type IndexOptions } from './index-cmd.js';

export interface ServeOptions extends IndexOptions {
  host?: string;
  port?: number;
  open?: boolean;
  index?: boolean;
}
export async function serveCommand(
  mode: 'default' | 'ui' | 'serve',
  engine: Engine,
  deps: CliDeps,
  path: string | undefined,
  options: ServeOptions,
) {
  const root = directory(deps.cwd, path);
  const project =
    mode !== 'ui' && engine.isProjectDir(root) ? await openProject(engine, deps, root) : null;
  const host = options.host ?? '127.0.0.1';
  if (
    !(
      host === '::1' ||
      host.toLowerCase() === 'localhost' ||
      (isIP(host) === 4 && host.startsWith('127.'))
    )
  ) {
    deps.stderr.write(
      '⚠ Catalyst is reachable from your network. Anyone with the URL can read your code summaries.\n',
    );
  }
  const server = await deps.startServer(engine, {
    host,
    port: options.port,
    staticDir: deps.staticDir,
  });
  try {
    const info = project?.info();
    const settings = engine.settings.get();
    const needsIndex = info?.status === 'never-indexed' || info?.status === 'stale';
    const shouldIndex = mode === 'default' && options.index !== false && needsIndex;
    const run =
      shouldIndex && project
        ? project.index(indexOptions(settings, options, deps.stderr))
        : project?.activeRun();
    const url = launchUrl(
      server.url,
      info ? { ...info, status: run ? 'indexing' : info.status } : null,
      { suggest: project ? undefined : projectAncestor(engine, root) },
    );
    if (deps.isTTY && project) printProjectHeader(deps.stdout, project, settings);
    deps.stdout.write(url + '\n');
    if (deps.isTTY) deps.stdout.write('Press Ctrl+C to stop Catalyst.\n');
    if (options.open !== false) {
      try {
        await deps.openBrowser(url);
      } catch {
        deps.stderr.write('Could not open a browser. Open the printed URL to continue.\n');
      }
    }
    if (run) await observeRun(run, deps);
    // The browser can start a run after the CLI's first run has already completed.
    const cancelActive = () => {
      try {
        for (const info of engine.projects.list()) {
          if (info.activeRunId) engine.projects.get(info.id)?.activeRun()?.cancel();
        }
      } catch {
        // A recently opened project may have moved. Engine.close also cancels open runs.
      }
    };
    if (deps.signal?.aborted) cancelActive();
    else deps.signal?.addEventListener('abort', cancelActive, { once: true });
    try {
      await deps.waitForStop?.('http');
    } finally {
      deps.signal?.removeEventListener('abort', cancelActive);
    }
    return deps.signal?.aborted ? EXIT.INTERRUPTED : EXIT.OK;
  } finally {
    await server.close();
  }
}
