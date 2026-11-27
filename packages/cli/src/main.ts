import { Command, CommanderError, InvalidArgumentError, Option } from 'commander';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Engine } from '@catalyst/core';
import { configGet, configSetToUpdate } from './config-keys.js';
import { directory, type CliDeps } from './context.js';
import { CliError, errorCode, EXIT } from './exit-codes.js';
import { askCommand } from './commands/ask.js';
import { indexCommand } from './commands/index-cmd.js';
import { healthCommand, impactCommand } from './commands/reports.js';
import { serveCommand } from './commands/serve.js';
import { providerCommand } from './commands/provider.js';
import { terminalPrompt } from './terminal-prompt.js';
import manifest from '../package.json';

export type { CliDeps } from './context.js';

function numberArg(min: number, max: number, integer = true) {
  return (text: string) => {
    const n = Number(text);
    if (
      !text.trim() ||
      !Number.isFinite(n) ||
      (integer && !Number.isInteger(n)) ||
      n < min ||
      n > max
    )
      throw new InvalidArgumentError('Value is outside the supported range.');
    return n;
  };
}
function language(command: Command) {
  return command.addOption(
    new Option('--lang <language>', 'output language').choices(['en', 'tr']),
  );
}

export function buildProgram(deps: CliDeps) {
  const program = new Command('catalyst');
  let result: number = EXIT.OK;
  function perform<T extends unknown[]>(
    action: (engine: Engine, ...args: T) => number | Promise<number>,
  ) {
    return async (...args: T) => {
      const verbose = program.opts().verbose || deps.env.CATALYST_LOG === 'debug';
      const env = verbose ? { ...deps.env, CATALYST_LOG: 'debug' } : deps.env;
      const log = (message: string) => {
        deps.stderr.write(message + '\n');
      };
      const engine = deps.createEngine({
        env,
        grammarsDir: deps.grammarsDir,
        logger: {
          debug: (message) => {
            if (verbose) log(message);
          },
          info: log,
          warn: log,
          error: log,
        },
      });
      try {
        result = await action(engine, ...args);
      } finally {
        await engine.close();
      }
    };
  }
  program.exitOverride().configureOutput({
    writeOut: (s) => {
      deps.stdout.write(s);
    },
    writeErr: (s) => {
      deps.stderr.write(s);
    },
    // Commander embeds the original argv in diagnostics. Config values may be secrets.
    outputError: (_message, write) => write('Invalid command or argument. Run catalyst --help.\n'),
  });
  program
    .version(manifest.version)
    .description('Explore a local codebase.')
    .argument('[path]', 'project directory')
    .option(
      '--port <port>',
      'preferred server port (default: CATALYST_PORT or 4321)',
      numberArg(1, 65535),
    )
    .option('--host <host>', 'server host', '127.0.0.1')
    .option('--verbose', 'write debug messages to stderr')
    .option('--no-open', 'print the URL without opening a browser')
    .option('--no-index', 'open the UI without automatic indexing')
    .option('--no-ai', 'skip AI stages');
  language(program).action(
    perform(async (engine, path: string | undefined) =>
      serveCommand('default', engine, deps, path, program.opts()),
    ),
  );
  program
    .command('ui')
    .description('Open the project launcher')
    .action(perform((engine) => serveCommand('ui', engine, deps, undefined, program.opts())));
  program
    .command('serve [path]')
    .description('Serve the UI without starting an index')
    .action(
      perform((engine, path: string | undefined) =>
        serveCommand('serve', engine, deps, path, program.opts()),
      ),
    );

  const index = language(program.command('index [path]').description('Index a project and exit'))
    .option('--no-ai', 'skip AI stages')
    .option('--force', 'rebuild the index')
    .option('--budget <usd>', 'spending cap', numberArg(0, Number.MAX_VALUE, false))
    .option('--concurrency <count>', 'parallel AI calls', numberArg(1, 32))
    .option('--json', 'write the completed run as JSON');
  index.action(
    perform((engine, path: string | undefined) => {
      const options = { ...program.opts(), ...index.opts() };
      if (program.opts().ai === false) options.ai = false;
      return indexCommand(engine, deps, path, options);
    }),
  );
  const ask = language(
    program.command('ask <question> [path]').description('Ask about an indexed project'),
  ).option('--json', 'write the final answer as JSON');
  ask.action(
    perform((engine, question: string, path: string | undefined) =>
      askCommand(engine, deps, question, path, { ...program.opts(), ...ask.opts() }),
    ),
  );
  const config = program.command('config').description('Manage local settings');
  config
    .command('provider')
    .description('Choose and test a provider')
    .action(perform((engine) => providerCommand(engine, deps)));
  config
    .command('list')
    .description('Show settings with masked keys')
    .action(
      perform((engine) => {
        deps.stdout.write(JSON.stringify(engine.settings.get(), null, 2) + '\n');
        return EXIT.OK;
      }),
    );
  config.command('get <key>').action(
    perform((engine, key: string) => {
      deps.stdout.write(configGet(key, engine.settings.get()) + '\n');
      return EXIT.OK;
    }),
  );
  config.command('set <key> <value>').action(
    perform((engine, key: string, value: string) => {
      const update = configSetToUpdate(key, value, engine.settings.get());
      engine.settings.update(update);
      deps.stdout.write('Settings updated.\n');
      return EXIT.OK;
    }),
  );
  const health = program
    .command('health [path]')
    .description('List flags, cycles and hubs')
    .option('--json', 'write health findings as JSON')
    .addOption(new Option('--fail-on <severity>').choices(['high', 'warn']));
  health.action(
    perform((engine, path: string | undefined) => healthCommand(engine, deps, path, health.opts())),
  );
  const impact = program
    .command('impact [path]')
    .description('Show which features and routes a diff affects')
    .option('--base <ref>', 'base revision for the comparison')
    .option('--no-narrative', 'show structural results only')
    .option('--json', 'write the diff impact as JSON');
  impact.action(
    perform((engine, path: string | undefined) => impactCommand(engine, deps, path, impact.opts())),
  );
  program
    .command('mcp [path]')
    .description('Serve project tools over MCP stdio')
    .action(
      perform(async (engine, path: string | undefined) => {
        await deps.startMcp(engine, directory(deps.cwd, path), deps.signal);
        await deps.waitForStop?.('mcp');
        return EXIT.OK;
      }),
    );
  const projects = program
    .command('projects')
    .description('List recent projects')
    .action(
      perform((engine) => {
        for (const p of engine.projects.list())
          deps.stdout.write([p.id, p.status, p.root].join('\t') + '\n');
        return EXIT.OK;
      }),
    );
  projects
    .command('forget <path-or-id>')
    .description('Remove a project from recents')
    .action(
      perform(async (engine, value: string) => {
        const path = resolve(deps.cwd, value);
        const project = engine.projects.list().find((p) => p.id === value || p.root === path);
        if (!project) throw new CliError(EXIT.NOT_FOUND, 'Unknown project.');
        await engine.projects.forget(project.id);
        return EXIT.OK;
      }),
    );
  return Object.assign(program, { result: () => result });
}

export async function run(deps: CliDeps, args: string[]): Promise<number> {
  const program = buildProgram(deps);
  try {
    await program.parseAsync(args, { from: 'user' });
    return deps.signal?.aborted ? EXIT.INTERRUPTED : program.result();
  } catch (error) {
    if (deps.signal?.aborted) return EXIT.INTERRUPTED;
    if (error instanceof CommanderError) return error.exitCode === 0 ? EXIT.OK : EXIT.BAD_ARGS;
    deps.stderr.write(
      (error instanceof Error ? error.message : 'Catalyst could not complete the command.') + '\n',
    );
    return errorCode(error);
  }
}

export async function main(args: string[]): Promise<number> {
  const controller = new AbortController();
  let stopAt = 0;
  const stopping = new Promise<void>((done) =>
    controller.signal.addEventListener('abort', () => done(), { once: true }),
  );
  const interrupt = () => {
    if (controller.signal.aborted) process.exit(EXIT.INTERRUPTED);
    stopAt = Date.now() + 2000;
    controller.abort();
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const [{ createEngine }, { startServer, startMcp }, { default: open }] = await Promise.all([
      import('@catalyst/core'),
      import('@catalyst/server'),
      import('open'),
    ]);
    return await run(
      {
        createEngine,
        startServer,
        startMcp,
        openBrowser: async (url) => {
          await open(url);
        },
        stdout: process.stdout,
        stderr: process.stderr,
        cwd: process.cwd(),
        env: process.env,
        isTTY: !!process.stdout.isTTY,
        signal: controller.signal,
        prompt:
          process.stdin.isTTY && process.stderr.isTTY
            ? (label, hidden = false) => terminalPrompt(label, hidden, controller.signal, interrupt)
            : undefined,
        staticDir: fileURLToPath(new URL('./web/', import.meta.url)),
        grammarsDir: fileURLToPath(new URL('./grammars/', import.meta.url)),
        waitForStop: async (mode) => {
          if (mode === 'mcp') {
            if (process.stdin.readableEnded || process.stdin.destroyed || controller.signal.aborted)
              return;
            await new Promise<void>((resolve) => {
              const stopped = () => {
                process.stdin.off('end', stopped);
                process.stdin.off('close', stopped);
                controller.signal.removeEventListener('abort', stopped);
                resolve();
              };
              process.stdin.once('end', stopped);
              process.stdin.once('close', stopped);
              controller.signal.addEventListener('abort', stopped, { once: true });
            });
          } else {
            await stopping;
            await new Promise<void>((done) => setTimeout(done, Math.max(0, stopAt - Date.now())));
          }
        },
      },
      args,
    );
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}
