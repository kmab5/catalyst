import { vi } from 'vitest';
import type { Engine, IndexRun, Project, QueryApi } from '@catalyst/core';
import * as dto from '@catalyst/shared';

export function testEngine() {
  const query: QueryApi = {
    getProject: () => dto.sampleProjectDTO, getOverview: () => dto.sampleOverviewDTO, getStack: () => dto.sampleOverviewDTO.stack,
    listFeatures: () => [dto.sampleFeatureListItemDTO], getFeature: () => dto.sampleFeatureDetailDTO, featuresOf: () => [],
    getNode: () => dto.sampleNodeDTO, getXRay: vi.fn(() => dto.sampleXRayDTO), getSource: async () => dto.sampleSourceDTO,
    getTree: () => dto.sampleTreeNodeDTO, listNodes: () => [], neighbours: () => [], impact: () => dto.sampleImpactDTO,
    graph: () => dto.sampleGraphResponse, pathsBetween: () => [], find: () => [dto.sampleFindResultDTO],
    search: () => [dto.sampleSearchResultDTO], routes: () => [], dataAccess: () => [],
    getHealth: () => dto.sampleHealthDTO, flagsFor: () => [], diffImpact: async () => dto.sampleDiffImpactDTO,
  };
  const run: IndexRun = {
    id: 'r', done: Promise.resolve(dto.sampleRunDTO), cancel: vi.fn(),
    async *events(since = 0) {
      for (const [i, stage] of (['scan','parse','done'] as const).entries()) {
        if (i + 1 > since) yield { id: i + 1, event: { stage, runId: 'r', done: i, total: 2 } };
      }
    },
  };
  const project: Project = {
    id: 'p', name: 'taxonomy', root: '/repos/taxonomy', info: () => ({ ...dto.sampleProjectDTO, id: 'p', lastRunId: 'r' }),
    query, index: vi.fn(() => run), activeRun: () => null, runById: id => id === 'r' ? run : undefined,
    getRun: id => id === 'r' ? dto.sampleRunDTO : null, async *ask() { yield dto.sampleAskEvent; },
    estimate: () => dto.sampleEstimateDTO, diffNarrative: async () => 'Affected customers use the billing feature.',
  };
  const engine: Engine = {
    projects: { get: id => id === 'p' ? project : undefined, list: () => [project.info()], open: async () => project, forget: vi.fn() },
    settings: { get: () => dto.sampleSettingsDTO, update: () => dto.sampleSettingsDTO, test: async () => dto.sampleTestProviderResult,
      detect: async () => dto.sampleProvidersDetectDTO },
    browse: () => dto.sampleFsBrowseDTO, isProjectDir: () => true, close: vi.fn(),
  };
  return { engine, project, query, run };
}
