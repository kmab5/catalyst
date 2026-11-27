import type { Engine, EngineOptions, Project } from '@catalyst/core';
import type { startMcp, startServer } from '@catalyst/server';
import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { CliError, EXIT } from './exit-codes.js';

export interface CliDeps {
  createEngine(options: EngineOptions): Engine;
  startServer: typeof startServer;
  startMcp: typeof startMcp;
  openBrowser(url: string): Promise<void>;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  env: NodeJS.ProcessEnv;
  isTTY: boolean;
  staticDir?: string;
  grammarsDir?: string;
  signal?: AbortSignal;
  waitForStop?(mode: 'http' | 'mcp'): Promise<void>;
  prompt?(label: string, hidden?: boolean): Promise<string>;
}

export function directory(cwd: string, path?: string): string {
  const root =
    path && /^~(?:[/\\]|$)/.test(path)
      ? resolve(homedir(), path.slice(2))
      : resolve(cwd, path ?? '.');
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory())
    throw new CliError(EXIT.NOT_FOUND, 'Directory not found: ' + root);
  return root;
}

export function projectAncestor(engine: Engine, path: string): string | undefined {
  let dir = path;
  while (!engine.isProjectDir(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return dir;
}

export async function openProject(engine: Engine, deps: CliDeps, root: string): Promise<Project> {
  const firstOpen = !statSync(join(root, '.catalyst'), { throwIfNoEntry: false });
  let project: Project;
  try {
    project = await engine.projects.open(root);
  } catch (error) {
    if (
      ['EACCES', 'EPERM', 'EROFS', 'SQLITE_CANTOPEN', 'SQLITE_READONLY'].includes(
        (error as NodeJS.ErrnoException).code ?? '',
      )
    ) {
      throw new CliError(
        EXIT.NOT_FOUND,
        'Cannot write .catalyst/ in ' + root + '. Catalyst stores its index next to your code.',
      );
    }
    throw error;
  }
  if (firstOpen && !statSync(join(root, '.gitignore'), { throwIfNoEntry: false }))
    deps.stderr.write('ℹ Tip: add .catalyst/ to your .gitignore\n');
  return project;
}

export async function indexedProject(
  engine: Engine,
  deps: CliDeps,
  path?: string,
): Promise<Project> {
  const project = await openProject(engine, deps, directory(deps.cwd, path));
  if (!project.info().lastIndexedAt)
    throw new CliError(EXIT.NOT_FOUND, 'This project needs an index. Run catalyst index first.');
  return project;
}
