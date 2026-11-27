import type { Engine } from '@catalyst/core';
import type { Lang } from '@catalyst/shared';
import { indexedProject, type CliDeps } from '../context.js';
import { CliError, EXIT } from '../exit-codes.js';
import { hasProvider } from './index-cmd.js';
import { renderCitationsForTerminal } from '../terminal-citations.js';

export async function askCommand(
  engine: Engine,
  deps: CliDeps,
  question: string,
  path: string | undefined,
  options: { lang?: Lang; json?: boolean },
) {
  if (!question.trim()) throw new CliError(EXIT.BAD_ARGS, 'Enter a question.');
  const project = await indexedProject(engine, deps, path);
  if (!hasProvider(engine.settings.get()))
    throw new CliError(EXIT.NO_AI, 'Choose a provider in Settings to use Ask.');
  // The provider can revise its answer. Only the done event carries validated citations.
  let streamed = '';
  for await (const event of project.ask({ question, lang: options.lang }, deps.signal)) {
    if (event.type === 'error') throw new CliError(EXIT.PROVIDER, event.message);
    if (event.type === 'token' && !options.json && deps.isTTY) {
      // Keep the preview to one terminal row. Redirected output receives the grounded answer.
      streamed += event.text;
      const preview = streamed
        .replace(/\[\[.*?(?:\]\]|$)/gs, '')
        .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
        .slice(-80);
      const columns = (deps.stdout as NodeJS.WriteStream).columns || 80;
      deps.stdout.write('\r\x1b[2K' + preview.slice(-Math.max(1, columns - 1)));
    }
    if (event.type === 'done') {
      if (streamed) deps.stdout.write('\r\x1b[2K');
      const { answer } = event;
      if (options.json) deps.stdout.write(JSON.stringify(answer) + '\n');
      else if (answer.found)
        deps.stdout.write(renderCitationsForTerminal(answer.markdown, answer.citations) + '\n');
      else
        deps.stdout.write(
          'Not found.\nChecked:\n' + answer.searched.map((item) => '  ' + item).join('\n') + '\n',
        );
      return EXIT.OK;
    }
  }
  throw new CliError(EXIT.PROVIDER, 'The provider ended the answer early.');
}
