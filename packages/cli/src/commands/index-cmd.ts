import type { Engine, IndexRun } from '@catalyst/core';
import type { IndexRequest, Lang, RunDTO, SettingsDTO } from '@catalyst/shared';
import { type CliDeps, directory, openProject } from '../context.js';
import { EXIT } from '../exit-codes.js';
import { createProgressRenderer, printProjectHeader } from '../progress.js';

export interface IndexOptions {
  ai?: boolean;
  force?: boolean;
  lang?: Lang;
  budget?: number;
  concurrency?: number;
  json?: boolean;
}

export function hasProvider(settings: SettingsDTO) {
  const provider = settings.provider;
  if (!provider) return false;
  return (
    (provider.type !== 'openrouter' && provider.type !== 'anthropic' && provider.type !== 'groq') ||
    provider.apiKeySource !== 'none'
  );
}

export function indexOptions(
  settings: SettingsDTO,
  options: IndexOptions,
  stderr: NodeJS.WritableStream,
): IndexRequest {
  const ai = options.ai !== false && hasProvider(settings);
  if (!ai && options.ai !== false) {
    stderr.write(
      'ℹ No AI provider configured — showing structure only (graph, search, health).\n' +
        '  Connect one to get plain-English explanations and features:\n' +
        '    • In the UI: Settings → AI provider\n' +
        '    • Or: catalyst config set provider.type openrouter && catalyst config set provider.apiKey <key>\n',
    );
  } else if (ai && settings.provider?.autoDetected && settings.provider.type === 'claude-code') {
    stderr.write('ℹ Using Claude Code CLI (billed to your Claude plan). Change in Settings.\n');
  }
  const request = {
    mode: options.force ? 'full' : 'incremental',
    ai,
    ...(options.lang && { language: options.lang }),
    ...(options.budget !== undefined && { budgetUsd: options.budget }),
    ...(options.concurrency !== undefined && { concurrency: options.concurrency }),
  } satisfies IndexRequest;
  return request;
}

export async function observeRun(run: IndexRun, deps: CliDeps, json = false): Promise<RunDTO> {
  const renderer = createProgressRenderer({
    stream: json ? deps.stderr : deps.stdout,
    isTTY: deps.isTTY && !json,
  });
  const cancel = () => run.cancel();
  if (deps.signal?.aborted) cancel();
  else deps.signal?.addEventListener('abort', cancel, { once: true });
  try {
    for await (const { event } of run.events()) renderer.update(event);
    const result = await run.done;
    renderer.finish(result);
    return result;
  } finally {
    deps.signal?.removeEventListener('abort', cancel);
  }
}

export async function indexCommand(
  engine: Engine,
  deps: CliDeps,
  path: string | undefined,
  options: IndexOptions,
) {
  const project = await openProject(engine, deps, directory(deps.cwd, path));
  const settings = engine.settings.get();
  if (deps.isTTY && !options.json) printProjectHeader(deps.stdout, project, settings);
  const run = project.index(indexOptions(settings, options, deps.stderr));
  const result = await observeRun(run, deps, options.json);
  if (options.json) deps.stdout.write(JSON.stringify(result) + '\n');
  if (result.status === 'cancelled') return EXIT.INTERRUPTED;
  return result.status === 'done' ? EXIT.OK : EXIT.FAIL;
}
