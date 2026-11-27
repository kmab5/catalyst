import type { Engine } from '@catalyst/core';
import { indexedProject, type CliDeps } from '../context.js';
import { CliError, EXIT } from '../exit-codes.js';
import { location, renderCitationsForTerminal } from '../terminal-citations.js';
import { hasProvider } from './index-cmd.js';

export async function healthCommand(
  engine: Engine,
  deps: CliDeps,
  path: string | undefined,
  options: { json?: boolean; failOn?: 'high' | 'warn' },
) {
  const project = await indexedProject(engine, deps, path);
  const health = project.query.getHealth();
  if (options.json) deps.stdout.write(JSON.stringify(health) + '\n');
  else {
    for (const severity of ['high', 'warn', 'info'] as const) {
      deps.stdout.write(severity + ' (' + health.summary[severity] + ')\n');
      for (const flag of health.flags.filter((flag) => flag.severity === severity))
        deps.stdout.write('  ' + flag.title + ' · ' + location(flag.node) + '\n');
    }
    deps.stdout.write('Cycles\n');
    for (const cycle of health.cycles) {
      const names = cycle.nodes.map((node) => node.filePath ?? node.name);
      if (names.length && (names.length === 1 || names.at(-1) !== names[0])) names.push(names[0]!);
      deps.stdout.write('  ' + names.join(' → ') + '\n');
    }
    deps.stdout.write('Top hubs\n');
    for (const { node, value } of health.metrics.topFanIn.slice(0, 5))
      deps.stdout.write('  ' + location(node) + ' · ' + value + ' dependants\n');
  }
  const hit =
    options.failOn &&
    (health.summary.high > 0 || (options.failOn === 'warn' && health.summary.warn > 0));
  return hit ? EXIT.FAIL : EXIT.OK;
}

export async function impactCommand(
  engine: Engine,
  deps: CliDeps,
  path: string | undefined,
  options: { json?: boolean; base?: string; narrative?: boolean },
) {
  const project = await indexedProject(engine, deps, path);
  const diff = {
    ...(await project.query.diffImpact({ base: options.base })),
    narrative: null as string | null,
  };
  if (options.narrative !== false && diff.changedFiles.length) {
    if (!hasProvider(engine.settings.get()))
      throw new CliError(EXIT.NO_AI, 'Configure a provider or use --no-narrative.');
    if (project.diffNarrative) diff.narrative = await project.diffNarrative(diff);
  }
  if (options.json) deps.stdout.write(JSON.stringify(diff) + '\n');
  else if (diff.unavailable) {
    deps.stdout.write(diff.unavailable === 'not-a-work-tree'
      ? 'This folder has no Git working tree. Open a Git project to compare changes.\n'
      : 'Install Git and restart Catalyst to compare changes.\n');
  } else {
    const groups: [string, string[]][] = [
      ['Changed files', diff.changedFiles.map((file) => file.status + ' ' + file.path)],
      ['Changed symbols', diff.changedNodes.filter((node) => node.kind === 'symbol').map(location)],
      [
        'Affected features',
        diff.affected.features.map(
          (f) => f.name + ' (' + f.changed + ' changed, ' + f.affected + ' affected)',
        ),
      ],
      ['Affected routes', diff.affected.routes.map((route) => route.name)],
    ];
    for (const [name, items] of groups)
      deps.stdout.write(
        name +
          '\n' +
          (items.length ? items.map((item) => '  ' + item).join('\n') : '  None') +
          '\n',
      );
    if (diff.narrative)
      deps.stdout.write(
        '\n' +
          renderCitationsForTerminal(diff.narrative, [
            ...diff.changedNodes,
            ...diff.affected.nodes,
          ]) +
          '\n',
      );
  }
  return EXIT.OK;
}
