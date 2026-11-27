import { vi } from 'vitest';
import { Writable } from 'node:stream';
import { join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Engine, IndexRun, Project, QueryApi } from '@catalyst/core';
import {
  sampleProjectDTO,
  sampleProgressEvent,
  sampleRunDTO,
  sampleSettingsDTO,
  sampleAskAnswer,
  sampleDiffImpactDTO,
  sampleHealthDTO,
  sampleProvidersDetectDTO,
  sampleFsBrowseDTO,
  sampleTestProviderResult,
  type AskAnswer,
  type AskEvent,
  type IndexRequest,
  type ProjectDTO,
  type SettingsDTO,
} from '@catalyst/shared';
import type { CliDeps } from '../src/context.js';

class Output extends Writable {
  text = '';
  _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void) {
    this.text += chunk.toString();
    done();
  }
}

export function fakeCli() {
  const cwd = mkdtempSync(join(tmpdir(), 'catalyst-cli-'));
  const root = join(cwd, 'project');
  mkdirSync(join(root, 'src'), { recursive: true });
  const info: ProjectDTO = { ...sampleProjectDTO, root };
  const settings: SettingsDTO = structuredClone(sampleSettingsDTO);
  let answer: AskAnswer = sampleAskAnswer;
  const events = vi.fn(async function* () {
    yield { id: 1, event: { ...sampleProgressEvent, stage: 'parse' as const } };
    yield { id: 2, event: sampleProgressEvent };
  });
  const indexRun: IndexRun = {
    id: 'r',
    events,
    done: Promise.resolve(sampleRunDTO),
    cancel: vi.fn(),
  };
  const index = vi.fn((_req?: IndexRequest) => indexRun);
  const query: Partial<QueryApi> = {
    getHealth: () => sampleHealthDTO,
    diffImpact: async () => sampleDiffImpactDTO,
  };
  // Unsupported queries fail loudly if a command starts depending on them.
  const queryApi = new Proxy(query, {
    get(target, key: keyof QueryApi) {
      if (!(key in target)) throw new Error('Unexpected fake query: ' + key);
      return target[key];
    },
  }) as QueryApi;
  const project: Project = {
    id: info.id,
    name: info.name,
    root,
    info: () => info,
    index,
    activeRun: () => null,
    getRun: () => null,
    query: queryApi,
    ask: async function* (): AsyncIterable<AskEvent> {
      yield { type: 'token', text: answer.markdown };
      yield { type: 'done', answer };
    },
  };
  const engine: Engine = {
    isProjectDir: (path) => path === root,
    browse: () => sampleFsBrowseDTO,
    projects: {
      get: () => project,
      list: () => [info],
      open: vi.fn(async () => project),
      forget: vi.fn(async () => {}),
    },
    settings: {
      get: () => settings,
      update: vi.fn(() => settings),
      detect: async () => sampleProvidersDetectDTO,
      test: async () => sampleTestProviderResult,
    },
    close: vi.fn(async () => {}),
  };
  const stdout = new Output();
  const stderr = new Output();
  const startServer = vi.fn(async () => ({
    url: 'http://127.0.0.1:4322',
    port: 4322,
    token: 'private-token',
    close: async () => {},
  }));
  const openBrowser = vi.fn(async (_url: string) => {});
  const startMcp = vi.fn(async () => {});
  const deps: CliDeps = {
    createEngine: () => engine,
    startServer,
    startMcp,
    openBrowser,
    stdout,
    stderr,
    cwd,
    env: {},
    isTTY: false,
  };
  return {
    deps,
    root,
    info,
    engine,
    index,
    indexRun,
    query,
    openBrowser,
    startMcp,
    stdout,
    stderr,
    settings,
    setAnswer: (next: AskAnswer) => {
      answer = next;
    },
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}
