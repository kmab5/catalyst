import { createColors } from 'picocolors';
import type { ProgressEvent, RunDTO, SettingsDTO } from '@catalyst/shared';
import manifest from '../package.json';

export function printProjectHeader(
  stream: NodeJS.WritableStream,
  project: { name: string; root: string },
  settings: SettingsDTO,
) {
  const provider = settings.provider
    ? settings.provider.type +
      ' · fast: ' +
      settings.models.fast +
      ' · smart: ' +
      settings.models.smart
    : 'Structure only';
  stream.write(
    '◆ catalyst v' +
      manifest.version +
      '\n\nProject   ' +
      project.name +
      '  (' +
      project.root +
      ')\nProvider  ' +
      provider +
      '\n',
  );
}

export function createProgressRenderer({
  stream,
  isTTY,
  fps = 10,
}: {
  stream: NodeJS.WritableStream;
  isTTY: boolean;
  fps?: number;
}) {
  const stages = new Map<string, ProgressEvent>();
  const colors = createColors(isTTY);
  let lastStage: string | undefined;
  let rows = 0;
  let lastDraw = -Infinity;
  function draw(run?: RunDTO) {
    const lines = [...stages.values()].map((e) => {
      const mark =
        e.degraded || e.stage === 'error'
          ? colors.yellow('!')
          : e.done >= e.total
            ? colors.green('✓')
            : '◐';
      const tokens = e.tokens ? '   tokens ' + e.tokens.in + ' in / ' + e.tokens.out + ' out' : '';
      const elapsed = run?.stats?.stageMs[e.stage];
      const timing = elapsed === undefined ? '' : '   ' + (elapsed / 1000).toFixed(1) + 's';
      const detail = e.message && e.stage !== 'error' ? '   ' + e.message : '';
      return (
        '  ' + mark + ' ' + e.stage.padEnd(14) + e.done + '/' + e.total + detail + tokens + timing
      );
    });
    stream.write((rows ? '\x1b[' + rows + 'A\r\x1b[0J' : '') + lines.join('\n') + '\n');
    rows = lines.length;
    lastDraw = Date.now();
  }
  return {
    update(event: ProgressEvent) {
      stages.set(event.stage, event);
      if (isTTY) {
        if (Date.now() - lastDraw >= 1000 / Math.min(10, Math.max(1, fps))) draw();
      } else if (event.stage !== lastStage) {
        stream.write('[catalyst] ' + event.stage + ' ' + event.done + '/' + event.total + '\n');
      }
      lastStage = event.stage;
    },
    finish(run: RunDTO) {
      if (isTTY && stages.size) {
        draw(run);
        if (run.stats?.llmCalls || run.stats?.cacheHits) {
          stream.write(
            '  Tokens ' +
              run.stats.tokens.in +
              ' in / ' +
              run.stats.tokens.out +
              ' out · ' +
              run.stats.llmCalls +
              ' calls · ' +
              run.stats.cacheHits +
              ' cache hits\n',
          );
        }
      }
      if (run.status === 'error') stream.write('Indexing failed. ' + (run.error ?? '') + '\n');
    },
  };
}
