import { z } from 'zod';
import {
  ProjectDTO,
  OverviewDTO,
  FeatureListItemDTO,
  FeatureDetailDTO,
  TreeNodeDTO,
  XRayDTO,
  SourceDTO,
  ImpactDTO,
  GraphResponse,
  FindResultDTO,
  SearchResultDTO,
  HealthDTO,
  SettingsDTO,
  ProvidersDetectDTO,
  FsBrowseDTO,
  ProgressEvent,
  AskEvent,
  RunDTO,
} from '../src/api/contract';

export const FixtureIndex = z.object({
  projects: z.array(ProjectDTO),
  overview: OverviewDTO,
  features: z.array(FeatureListItemDTO),
  featureDetails: z.record(z.string(), FeatureDetailDTO),
  tree: TreeNodeDTO,
  nodes: z.record(z.string(), XRayDTO),
  sources: z.record(z.string(), SourceDTO),
  impact: z.record(z.string(), ImpactDTO),
  graph: z.object({
    file: GraphResponse,
    feature: GraphResponse,
  }),
  find: z.record(z.string(), z.array(FindResultDTO)),
  search: z.record(z.string(), z.array(SearchResultDTO)),
  health: HealthDTO,
  settings: SettingsDTO,
  providersDetect: ProvidersDetectDTO,
  fsBrowse: FsBrowseDTO,
  run: RunDTO,
  runEvents: z.array(ProgressEvent),
  askScripts: z.record(z.string(), z.array(AskEvent)),
});

export type FixtureIndex = z.infer<typeof FixtureIndex>;
