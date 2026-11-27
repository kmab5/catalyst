import { z } from 'zod';
import { Lang, NodeKind, EdgeKind, Provenance, NodeRef, NodeDTO, EdgeRefDTO, FlagDTO, GraphDTO } from './graph.js';
import { SideEffect, FileSummary, ModuleSummary } from './summary.js';
import { Feature } from './feature.js';
import { AppOverview } from './overview.js';
import { ProgressEvent } from './events.js';
import { ProviderType, ProviderConfig } from './config.js';

export const ProjectStatus = z.enum(['never-indexed', 'indexing', 'ready', 'stale', 'error']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const ProjectDTO = z.object({
  id: z.string(),
  name: z.string(),
  root: z.string(),
  status: ProjectStatus,
  aiStatus: z.enum(['done', 'partial', 'skipped', 'none']),
  activeRunId: z.string().nullable(),
  lastRunId: z.string().nullable(),
  lastIndexedAt: z.number().nullable(),
  lastOpenedAt: z.number(),
  outputLanguage: z.enum(['en', 'tr']),
  stats: z.object({
    files: z.number(), analysedFiles: z.number(), symbols: z.number(), edges: z.number(),
    features: z.number(), flags: z.number(),
    languages: z.array(z.object({ language: z.string(), files: z.number(), tier: z.number() })),
  }).nullable(),
});
export type ProjectDTO = z.infer<typeof ProjectDTO>;

export const RunDTO = z.object({
  id: z.string(), status: z.enum(['running', 'done', 'error', 'cancelled']),
  startedAt: z.number(), finishedAt: z.number().nullable(),
  lastEvent: ProgressEvent.nullable(),
  stats: z.object({
    stageMs: z.record(z.string(), z.number()),
    tokens: z.object({ in: z.number(), out: z.number() }),
    llmCalls: z.number(), cacheHits: z.number(), costUsdEstimate: z.number().nullable(), errors: z.array(z.string()).optional(), repairs: z.record(z.string(), z.number()).optional(),
  }).nullable(),
  error: z.string().nullable(),
});
export type RunDTO = z.infer<typeof RunDTO>;

export const FeatureListItemDTO = z.object({
  id: z.string(), name: z.string(), category: Feature.shape.category, summary: z.string(),
  memberCount: z.number(), entryPointCount: z.number(), flowCount: z.number(),
  flagCount: z.number(), colorIndex: z.number(),
  changeabilityRating: z.enum(['easy', 'moderate', 'hard']).nullable(),
});
export type FeatureListItemDTO = z.infer<typeof FeatureListItemDTO>;

export const OverviewDTO = z.object({
  overview: AppOverview.nullable(),
  stack: z.array(z.object({ name: z.string(), category: z.string(), evidence: z.array(z.string()) })),
  features: z.array(FeatureListItemDTO),
  entryPoints: z.array(NodeRef),
  health: z.object({ high: z.number(), warn: z.number(), info: z.number(), topFlags: z.array(FlagDTO).max(5) }),
  project: ProjectDTO,
});
export type OverviewDTO = z.infer<typeof OverviewDTO>;

const TreeNodeFields = z.object({
  id: z.string(),
  name: z.string(), path: z.string(),
  type: z.enum(['dir', 'file']),
  language: z.string().nullable(), tier: z.number().nullable(),
  featureIds: z.array(z.string()),
  flagCount: z.number(),
  role: FileSummary.shape.role.nullable(),
});
type TreeNode = z.infer<typeof TreeNodeFields> & { children?: TreeNode[] };
export const TreeNodeDTO: z.ZodType<TreeNode> = TreeNodeFields.extend({
  children: z.lazy(() => z.array(TreeNodeDTO)).optional(),
});
export type TreeNodeDTO = z.infer<typeof TreeNodeDTO>;

export const SourceDTO = z.object({
  nodeId: z.string(), filePath: z.string(), language: z.string(),
  startLine: z.number(), endLine: z.number(), totalLines: z.number(),
  text: z.string(),
  outline: z.array(z.object({ nodeId: z.string(), name: z.string(), symbolKind: z.string(), startLine: z.number(), endLine: z.number(), depth: z.number() })),
});
export type SourceDTO = z.infer<typeof SourceDTO>;

export const FindResultDTO = z.object({
  node: NodeRef, score: z.number(),
  matchRanges: z.array(z.tuple([z.number(), z.number()])),
  context: z.string().nullable(),
});
export type FindResultDTO = z.infer<typeof FindResultDTO>;

export const SearchResultDTO = z.object({
  node: NodeRef, score: z.number(),
  field: z.enum(['name', 'path', 'summary', 'tags', 'code']),
  snippet: z.string(),
  purpose: z.string().nullable(),
});
export type SearchResultDTO = z.infer<typeof SearchResultDTO>;

export const HealthDTO = z.object({
  summary: z.object({ high: z.number(), warn: z.number(), info: z.number(), byRule: z.record(z.string(), z.number()) }),
  flags: z.array(FlagDTO),
  cycles: z.array(z.object({ id: z.string(), nodes: z.array(NodeRef), size: z.number() })),
  metrics: z.object({
    topFanIn: z.array(z.object({ node: NodeRef, value: z.number() })),
    topComplexity: z.array(z.object({ node: NodeRef, value: z.number() })),
    largestFiles: z.array(z.object({ node: NodeRef, value: z.number() })),
    featureCoupling: z.array(z.object({ from: z.string(), to: z.string(), edges: z.number() })),
  }),
});
export type HealthDTO = z.infer<typeof HealthDTO>;

export const SettingsDTO = z.object({
  provider: z.object({
    type: ProviderType,
    baseUrl: z.string().nullable(),
    binary: z.string().nullable(),
    apiKeyMasked: z.string().nullable(),
    apiKeySource: z.enum(['config', 'env', 'none']),
    autoDetected: z.boolean(),
  }).nullable(),
  models: z.object({ fast: z.string(), smart: z.string() }),
  outputLanguage: z.enum(['en', 'tr']),
  budgetUsd: z.number().nullable(),
  concurrency: z.number().int().min(1).max(32),
  telemetry: z.literal(false),
});
export type SettingsDTO = z.infer<typeof SettingsDTO>;

export const SettingsUpdate = z.object({
  provider: z.discriminatedUnion('type', [
    ProviderConfig.options[0].partial({ baseUrl: true }).extend({ apiKey: z.string().nullable().optional() }),
    ProviderConfig.options[1].extend({ apiKey: z.string().nullable().optional() }),
    ProviderConfig.options[2].partial({ baseUrl: true, name: true }).extend({ apiKey: z.string().nullable().optional() }),
    ProviderConfig.options[3].partial({ binary: true }),
  ]).nullable().optional(),
  models: z.object({ fast: z.string(), smart: z.string() }).partial().optional(),
  outputLanguage: z.enum(['en', 'tr']).optional(),
  budgetUsd: z.number().nullable().optional(),
  concurrency: z.number().int().min(1).max(32).optional(),
});
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;

export const EstimateDTO = z.object({
  files: z.number(), filesNeedingSummary: z.number(), cachedSummaries: z.number(),
  llmCalls: z.number(),
  tokens: z.object({ in: z.number(), out: z.number() }),
  costUsd: z.number().nullable(),
  model: z.object({ fast: z.string(), smart: z.string() }),
  note: z.string().nullable(),
});
export type EstimateDTO = z.infer<typeof EstimateDTO>;

export const DiffImpactRequest = z.object({ base: z.string().min(1).optional(), narrative: z.boolean().default(true), lang: Lang.optional() });
export type DiffImpactRequest = z.infer<typeof DiffImpactRequest>;

export const DiffImpactDTO = z.object({
  unavailable: z.enum(['not-a-work-tree', 'git-not-installed']).optional(),
  base: z.string(), head: z.string(),
  changedFiles: z.array(z.object({ path: z.string(), status: z.enum(['added', 'modified', 'deleted', 'renamed']) })),
  changedNodes: z.array(NodeRef),
  affected: z.object({
    nodes: z.array(NodeRef.extend({ distance: z.number() })),
    features: z.array(z.object({ featureId: z.string(), name: z.string(), changed: z.number(), affected: z.number() })),
    routes: z.array(NodeRef),
  }),
  flagsTouched: z.array(FlagDTO),
  narrative: z.string().nullable(),
});
export type DiffImpactDTO = z.infer<typeof DiffImpactDTO>;

export const XRayDTO = z.object({
  summaryMeta: z.object({ model: z.string(), createdAt: z.number() }).nullable().optional(),
  node: NodeDTO,
  summary: FileSummary.or(ModuleSummary).nullable(),
  symbolPurpose: z.string().nullable(),
  features: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })),
  upstream: z.array(EdgeRefDTO),
  downstream: z.array(EdgeRefDTO),
  sideEffects: z.array(SideEffect),
  flags: z.array(FlagDTO),
  impactPreview: z.object({ dependants: z.number(), features: z.array(z.string()), routes: z.array(z.string()) }),
});
export type XRayDTO = z.infer<typeof XRayDTO>;

export const ImpactDTO = z.object({
  root: z.string(), direction: z.enum(['up','down','both']), depth: z.number(),
  nodes: z.array(NodeRef.extend({ distance: z.number(), direction: z.enum(['up','down']) })),
  edges: z.array(EdgeRefDTO),
  byFeature: z.array(z.object({ featureId: z.string(), count: z.number() })),
  routes: z.array(z.string()),
  truncated: z.boolean(),
});
export type ImpactDTO = z.infer<typeof ImpactDTO>;

export const IndexRequest = z.object({ concurrency: z.number().int().min(1).max(32).optional(), mode: z.enum(['incremental','full']).default('incremental'), ai: z.boolean().default(true), budgetUsd: z.number().nonnegative().optional(), language: Lang.optional() });
export type IndexRequest = z.input<typeof IndexRequest>;

export const AskRequest = z.object({ question: z.string().trim().min(1), lang: Lang.optional(), history: z.array(z.object({ role: z.enum(['user','assistant']), content: z.string() })).optional() });
export type AskRequest = z.infer<typeof AskRequest>;

export const GraphQuery = z.object({
  level: GraphDTO.shape.level.default('file'), focus: z.string().optional(), depth: z.number().int().nonnegative().default(2),
  feature: z.string().optional(), edgeKinds: z.array(EdgeKind).optional(), nodeKinds: z.array(NodeKind).optional(),
  provenance: z.array(Provenance).optional(), limit: z.number().int().positive().default(400),
});
export type GraphQuery = z.input<typeof GraphQuery>;

export const GraphResponse = GraphDTO.extend({ truncated: z.boolean(), totalNodes: z.number() });
export type GraphResponse = z.infer<typeof GraphResponse>;

export const FsBrowseDTO = z.object({ path: z.string(), parent: z.string().nullable(), entries: z.array(z.object({ name: z.string(), path: z.string(), isProject: z.boolean(), hasIndex: z.boolean() })) });
export type FsBrowseDTO = z.infer<typeof FsBrowseDTO>;

export const ProvidersDetectDTO = z.object({
  claudeCli: z.object({ found: z.boolean(), version: z.string().optional() }), ollama: z.object({ found: z.boolean(), models: z.array(z.string()) }),
  env: z.object({ OPENROUTER_API_KEY: z.boolean(), ANTHROPIC_API_KEY: z.boolean(), OPENAI_API_KEY: z.boolean() }),
});
export type ProvidersDetectDTO = z.infer<typeof ProvidersDetectDTO>;

export const TestProviderResult = z.object({ ok: z.boolean(), model: z.string(), latencyMs: z.number(), message: z.string().optional() });
export type TestProviderResult = z.infer<typeof TestProviderResult>;

export const HealthResponse = z.object({ ok: z.literal(true), version: z.string(), mock: z.boolean() });
export type HealthResponse = z.infer<typeof HealthResponse>;

export const ErrorCode = z.enum(['BAD_REQUEST','UNAUTHORIZED','PROJECT_NOT_FOUND','NODE_NOT_FOUND','PATH_NOT_FOUND','NOT_INDEXED','INDEX_RUNNING','AI_NOT_CONFIGURED','PROVIDER_ERROR','INTERNAL','NOT_IMPLEMENTED']);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.object({ error: z.object({ code: ErrorCode, message: z.string(), details: z.unknown().optional() }) });
export type ErrorBody = z.infer<typeof ErrorBody>;
