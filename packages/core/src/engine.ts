import type { AskEvent, AskRequest, DiffImpactDTO, EstimateDTO, FsBrowseDTO, IndexRequest, Lang, ProgressEvent, ProjectDTO, ProviderConfig, ProvidersDetectDTO, RunDTO, SettingsDTO, SettingsUpdate, TestProviderResult } from '@catalyst/shared';
import type { QueryApi } from './query/types.js';
import { CatalystError } from './errors.js';

export interface Logger {
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface EngineOptions {
  homeDir?: string;
  grammarsDir?: string;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
}
export interface Engine {
  projects: {
    list(): ProjectDTO[];
    open(path: string): Promise<Project>;
    get(pid: string): Project | undefined;
    forget(pid: string, opts?: { purge?: boolean }): Promise<void>;
  };
  settings: {
    get(): SettingsDTO;
    update(u: SettingsUpdate): SettingsDTO;
    test(provider?: ProviderConfig): Promise<TestProviderResult>;
    detect(): Promise<ProvidersDetectDTO>;
  };
  isProjectDir(path: string): boolean;
  browse(path?: string): FsBrowseDTO;
  close(): Promise<void>;
}
export interface Project {
  readonly id: string; readonly root: string; readonly name: string;
  info(): ProjectDTO;
  index(req?: IndexRequest): IndexRun;
  runById?(rid: string): IndexRun | undefined;
  estimate?(lang?: Lang): EstimateDTO;
  diffNarrative?(impact: DiffImpactDTO, lang?: Lang): Promise<string | null>;
  asks?(): { id: string; question: string; createdAt: number }[];
  activeRun(): IndexRun | null;
  getRun(runId: string): RunDTO | null;
  query: QueryApi;
  ask(req: AskRequest, signal?: AbortSignal): AsyncIterable<AskEvent>;
}
export interface IndexRun {
  readonly id: string;
  events(sinceId?: number): AsyncIterable<{ id: number; event: ProgressEvent }>;
  readonly done: Promise<RunDTO>;
  cancel(): void;
}

export function createEngine(_opts?: EngineOptions): Engine {
  const pending = (): never => { throw new CatalystError('NOT_IMPLEMENTED', 'Engine implementation pending'); };
  return {
    projects: { list: pending, open: pending, get: pending, forget: pending },
    settings: { get: pending, update: pending, test: pending, detect: pending },
    isProjectDir: pending, browse: pending, close: pending,
  };
}
