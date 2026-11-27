import { z } from 'zod';

export const Lang = z.enum(['en', 'tr']);
export type Lang = z.infer<typeof Lang>;

export const NodeKind = z.enum([
  'directory',
  'file',
  'symbol',
  'route',
  'db_model',
  'env_var',
  'package',
  'service',
  'feature',
]);
export type NodeKind = z.infer<typeof NodeKind>;

export const EdgeKind = z.enum([
  'contains',
  'imports',
  'calls',
  'references',
  'renders',
  'extends',
  'implements',
  'handles',
  'reads',
  'writes',
  'uses_env',
  'calls_service',
  'depends_on',
  'member_of',
  'feature_depends',
]);
export type EdgeKind = z.infer<typeof EdgeKind>;

export const Provenance = z.enum(['ast', 'resolved', 'heuristic', 'inferred']);
export type Provenance = z.infer<typeof Provenance>;

export const Severity = z.enum(['info', 'warn', 'high']);
export type Severity = z.infer<typeof Severity>;

export const SymbolKind = z.enum([
  'function',
  'class',
  'method',
  'variable',
  'type',
  'interface',
  'enum',
  'component',
  'hook',
]);
export type SymbolKind = z.infer<typeof SymbolKind>;

export const ErrorCode = z.enum([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'PROJECT_NOT_FOUND',
  'NODE_NOT_FOUND',
  'PATH_NOT_FOUND',
  'NOT_INDEXED',
  'INDEX_RUNNING',
  'AI_NOT_CONFIGURED',
  'PROVIDER_ERROR',
  'INTERNAL',
  'NOT_IMPLEMENTED',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const NodeRef = z.object({
  id: z.string(),
  kind: NodeKind,
  name: z.string(),
  filePath: z.string().nullable(),
  startLine: z.number().nullable(),
  provenance: Provenance,
});
export type NodeRef = z.infer<typeof NodeRef>;

export const NodeDTO = NodeRef.extend({
  endLine: z.number().nullable(),
  symbolKind: z.string().nullable(),
  exported: z.boolean(),
  signature: z.string().nullable(),
  confidence: z.number(),
  tier: z.number().nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  metrics: z.record(z.string(), z.number()),
});
export type NodeDTO = z.infer<typeof NodeDTO>;

export const EdgeRefDTO = z.object({
  kind: EdgeKind,
  provenance: Provenance,
  confidence: z.number(),
  node: NodeRef,
  line: z.number().nullable(),
  filePath: z.string().nullable(),
});
export type EdgeRefDTO = z.infer<typeof EdgeRefDTO>;

export const FlagDTO = z.object({
  id: z.string(),
  rule: z.string(),
  severity: Severity,
  node: NodeRef,
  title: z.string(),
  explanation: z.string().nullable(),
  evidence: z.object({
    metrics: z.record(z.string(), z.number()).optional(),
    nodeIds: z.array(z.string()).optional(),
    cycle: z.array(z.string()).optional(),
  }),
});
export type FlagDTO = z.infer<typeof FlagDTO>;

export const SideEffect = z.object({
  kind: z.enum([
    'db_read',
    'db_write',
    'network',
    'filesystem',
    'env',
    'state',
    'auth',
    'email',
    'payment',
    'log',
    'other',
  ]),
  description: z.string(),
  target: z.string().optional(),
});
export type SideEffect = z.infer<typeof SideEffect>;

export const FileSummary = z.object({
  nodeId: z.string(),
  purpose: z.string(),
  details: z.string(),
  role: z.enum([
    'page',
    'layout',
    'ui_component',
    'api_handler',
    'server_action',
    'middleware',
    'service',
    'data_access',
    'model',
    'schema',
    'auth',
    'config',
    'util',
    'hook',
    'types',
    'test',
    'script',
    'styles',
    'other',
  ]),
  positionInApp: z.string(),
  sideEffects: z.array(SideEffect),
  tags: z.array(z.string()).max(12),
  symbols: z.array(z.object({ nodeId: z.string(), purpose: z.string() })),
  featureHints: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});
export type FileSummary = z.infer<typeof FileSummary>;

export const ModuleSummary = z.object({
  nodeId: z.string(),
  purpose: z.string(),
  details: z.string(),
  keyFiles: z.array(z.string()),
  tags: z.array(z.string()),
});
export type ModuleSummary = z.infer<typeof ModuleSummary>;

export const Ease = z.enum(['easy', 'moderate', 'hard']);
export type Ease = z.infer<typeof Ease>;

export const Changeability = z.object({
  addEase: z.object({ level: Ease, reason: z.string() }),
  changeEase: z.object({ level: Ease, reason: z.string() }),
  removeEase: z.object({ level: Ease, reason: z.string() }),
  touchpoints: z.array(z.string()),
  risks: z.array(z.object({ text: z.string(), nodeIds: z.array(z.string()) })),
  couplings: z.array(
    z.object({ featureId: z.string(), edgeCount: z.number(), note: z.string() }),
  ),
  citesMetrics: z.array(
    z.object({
      name: z.string(),
      value: z.union([z.number(), z.string()]),
      nodeId: z.string().optional(),
    }),
  ),
  summary: z.string(),
});
export type Changeability = z.infer<typeof Changeability>;

export const FeatureMember = z.object({
  nodeId: z.string(),
  role: z.enum(['entry', 'core', 'support', 'data', 'ui', 'config', 'test']),
  reason: z.string().optional(),
});
export type FeatureMember = z.infer<typeof FeatureMember>;

export const FlowStep = z.object({
  nodeId: z.string(),
  action: z.string(),
  edgeVerified: z.boolean(),
  confidence: z.number().optional(),
});
export type FlowStep = z.infer<typeof FlowStep>;

export const Flow = z.object({
  id: z.string(),
  name: z.string(),
  trigger: z.string(),
  steps: z.array(FlowStep).min(2),
});
export type Flow = z.infer<typeof Flow>;

export const Feature = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum([
    'auth',
    'data',
    'payments',
    'ui',
    'api',
    'content',
    'notifications',
    'integration',
    'admin',
    'infra',
    'analytics',
    'core',
    'other',
  ]),
  summary: z.string(),
  description: z.string(),
  entryPoints: z.array(z.string()),
  members: z.array(FeatureMember),
  flows: z.array(Flow),
  dependsOn: z.array(z.string()),
  services: z.array(z.string()),
  dataModels: z.array(z.string()),
  changeability: Changeability.optional(),
  confidence: z.number(),
});
export type Feature = z.infer<typeof Feature>;

export const FeatureDetailDTO = Feature.extend({
  members: z.array(FeatureMember.extend({ node: NodeRef })),
});
export type FeatureDetailDTO = z.infer<typeof FeatureDetailDTO>;

export const AppOverview = z.object({
  name: z.string(),
  oneLiner: z.string(),
  description: z.string(),
  audience: z.string(),
  stack: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      evidence: z.array(z.string()),
    }),
  ),
  architecture: z.string(),
  featureIds: z.array(z.string()),
  entryPoints: z.array(z.string()),
  gaps: z.array(z.string()),
});
export type AppOverview = z.infer<typeof AppOverview>;

export const XRayDTO = z.object({
  node: NodeDTO,
  summary: FileSummary.or(ModuleSummary).nullable(),
  symbolPurpose: z.string().nullable(),
  features: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })),
  upstream: z.array(EdgeRefDTO),
  downstream: z.array(EdgeRefDTO),
  sideEffects: z.array(SideEffect),
  flags: z.array(FlagDTO),
  impactPreview: z.object({
    dependants: z.number(),
    features: z.array(z.string()),
    routes: z.array(z.string()),
  }),
});
export type XRayDTO = z.infer<typeof XRayDTO>;

export const ImpactDTO = z.object({
  root: z.string(),
  direction: z.enum(['up', 'down', 'both']),
  depth: z.number(),
  nodes: z.array(
    NodeRef.extend({ distance: z.number(), direction: z.enum(['up', 'down']) }),
  ),
  edges: z.array(EdgeRefDTO),
  byFeature: z.array(z.object({ featureId: z.string(), count: z.number() })),
  routes: z.array(z.string()),
  truncated: z.boolean(),
});
export type ImpactDTO = z.infer<typeof ImpactDTO>;

export const GraphDTO = z.object({
  level: z.enum(['feature', 'module', 'file', 'symbol']),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      kind: NodeKind,
      parent: z.string().nullable(),
      featureId: z.string().nullable(),
      size: z.number(),
      flags: z.number(),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      kind: EdgeKind,
      weight: z.number(),
      provenance: Provenance,
    }),
  ),
});
export type GraphDTO = z.infer<typeof GraphDTO>;

export const GraphResponse = GraphDTO.extend({
  truncated: z.boolean(),
  totalNodes: z.number(),
});
export type GraphResponse = z.infer<typeof GraphResponse>;

export const AskAnswer = z.object({
  markdown: z.string(),
  found: z.boolean(),
  citations: z.array(NodeRef),
  searched: z.array(z.string()),
});
export type AskAnswer = z.infer<typeof AskAnswer>;

export const AskEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thinking'), text: z.string() }),
  z.object({
    type: z.literal('tool'),
    name: z.string(),
    args: z.unknown(),
    resultSummary: z.string(),
  }),
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('done'), answer: AskAnswer }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type AskEvent = z.infer<typeof AskEvent>;

export const ProgressEvent = z.object({
  runId: z.string(),
  stage: z.enum([
    'scan',
    'parse',
    'resolve',
    'detect',
    'graph',
    'health',
    'summarize',
    'rollup',
    'features',
    'overview',
    'changeability',
    'fts',
    'done',
    'error',
    'cancelled',
  ]),
  done: z.number(),
  total: z.number(),
  message: z.string().optional(),
  tokens: z.object({ in: z.number(), out: z.number() }).optional(),
  degraded: z.boolean().optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;

export const ProjectStatus = z.enum([
  'never-indexed',
  'indexing',
  'ready',
  'stale',
  'error',
]);
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
  outputLanguage: Lang,
  stats: z
    .object({
      files: z.number(),
      analysedFiles: z.number(),
      symbols: z.number(),
      edges: z.number(),
      features: z.number(),
      flags: z.number(),
      languages: z.array(
        z.object({ language: z.string(), files: z.number(), tier: z.number() }),
      ),
    })
    .nullable(),
});
export type ProjectDTO = z.infer<typeof ProjectDTO>;

export const RunDTO = z.object({
  id: z.string(),
  status: z.enum(['running', 'done', 'error', 'cancelled']),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  lastEvent: ProgressEvent.nullable(),
  stats: z
    .object({
      stageMs: z.record(z.string(), z.number()),
      tokens: z.object({ in: z.number(), out: z.number() }),
      llmCalls: z.number(),
      cacheHits: z.number(),
      costUsdEstimate: z.number().nullable(),
    })
    .nullable(),
  error: z.string().nullable(),
});
export type RunDTO = z.infer<typeof RunDTO>;

export const FeatureListItemDTO = z.object({
  id: z.string(),
  name: z.string(),
  category: Feature.shape.category,
  summary: z.string(),
  memberCount: z.number(),
  entryPointCount: z.number(),
  flowCount: z.number(),
  flagCount: z.number(),
  colorIndex: z.number(),
  changeabilityRating: Ease.nullable(),
});
export type FeatureListItemDTO = z.infer<typeof FeatureListItemDTO>;

export const OverviewDTO = z.object({
  overview: AppOverview.nullable(),
  stack: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      evidence: z.array(z.string()),
    }),
  ),
  features: z.array(FeatureListItemDTO),
  entryPoints: z.array(NodeRef),
  health: z.object({
    high: z.number(),
    warn: z.number(),
    info: z.number(),
    topFlags: z.array(FlagDTO).max(5),
  }),
  project: ProjectDTO,
});
export type OverviewDTO = z.infer<typeof OverviewDTO>;

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: 'dir' | 'file';
  language: string | null;
  tier: number | null;
  featureIds: string[];
  flagCount: number;
  role: FileSummary['role'] | null;
  children?: TreeNode[];
}

export const TreeNodeDTO: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    type: z.enum(['dir', 'file']),
    language: z.string().nullable(),
    tier: z.number().nullable(),
    featureIds: z.array(z.string()),
    flagCount: z.number(),
    role: FileSummary.shape.role.nullable(),
    children: z.array(TreeNodeDTO).optional(),
  }),
);
export type TreeNodeDTO = z.infer<typeof TreeNodeDTO>;

export const SourceDTO = z.object({
  nodeId: z.string(),
  filePath: z.string(),
  language: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  totalLines: z.number(),
  text: z.string(),
  outline: z.array(
    z.object({
      nodeId: z.string(),
      name: z.string(),
      symbolKind: z.string(),
      startLine: z.number(),
      endLine: z.number(),
      depth: z.number(),
    }),
  ),
});
export type SourceDTO = z.infer<typeof SourceDTO>;

export const FindResultDTO = z.object({
  node: NodeRef,
  score: z.number(),
  matchRanges: z.array(z.tuple([z.number(), z.number()])),
  context: z.string().nullable(),
});
export type FindResultDTO = z.infer<typeof FindResultDTO>;

export const SearchResultDTO = z.object({
  node: NodeRef,
  score: z.number(),
  field: z.enum(['name', 'path', 'summary', 'tags', 'code']),
  snippet: z.string(),
  purpose: z.string().nullable(),
});
export type SearchResultDTO = z.infer<typeof SearchResultDTO>;

export const HealthDTO = z.object({
  summary: z.object({
    high: z.number(),
    warn: z.number(),
    info: z.number(),
    byRule: z.record(z.string(), z.number()),
  }),
  flags: z.array(FlagDTO),
  cycles: z.array(
    z.object({ id: z.string(), nodes: z.array(NodeRef), size: z.number() }),
  ),
  metrics: z.object({
    topFanIn: z.array(z.object({ node: NodeRef, value: z.number() })),
    topComplexity: z.array(z.object({ node: NodeRef, value: z.number() })),
    largestFiles: z.array(z.object({ node: NodeRef, value: z.number() })),
    featureCoupling: z.array(
      z.object({ from: z.string(), to: z.string(), edges: z.number() }),
    ),
  }),
});
export type HealthDTO = z.infer<typeof HealthDTO>;

export const ProviderType = z.enum([
  'openrouter',
  'anthropic',
  'openai-compatible',
  'claude-code',
]);
export type ProviderType = z.infer<typeof ProviderType>;

export const ProviderConfig = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('openrouter'),
    apiKey: z.string().optional(),
    baseUrl: z.string().default('https://openrouter.ai/api/v1'),
  }),
  z.object({
    type: z.literal('anthropic'),
    apiKey: z.string().optional(),
  }),
  z.object({
    type: z.literal('openai-compatible'),
    apiKey: z.string().optional(),
    baseUrl: z.string(),
    name: z.string().default('custom'),
  }),
  z.object({
    type: z.literal('claude-code'),
    binary: z.string().default('claude'),
  }),
]);
export type ProviderConfig = z.infer<typeof ProviderConfig>;

export const GlobalConfig = z.object({
  version: z.literal(1),
  provider: ProviderConfig.nullable(),
  models: z.object({ fast: z.string(), smart: z.string() }),
  outputLanguage: Lang.default('en'),
  budgetUsd: z.number().positive().nullable().default(null),
  concurrency: z.number().int().min(1).max(32).default(6),
  telemetry: z.literal(false).default(false),
});
export type GlobalConfig = z.infer<typeof GlobalConfig>;

export const SettingsDTO = z.object({
  provider: z
    .object({
      type: ProviderType,
      baseUrl: z.string().nullable(),
      binary: z.string().nullable(),
      apiKeyMasked: z.string().nullable(),
      apiKeySource: z.enum(['config', 'env', 'none']),
      autoDetected: z.boolean(),
    })
    .nullable(),
  models: z.object({ fast: z.string(), smart: z.string() }),
  outputLanguage: Lang,
  budgetUsd: z.number().nullable(),
  concurrency: z.number().int().min(1).max(32),
  telemetry: z.literal(false),
});
export type SettingsDTO = z.infer<typeof SettingsDTO>;

export const SettingsUpdate = z.object({
  provider: ProviderConfig.nullable().optional(),
  models: z.object({ fast: z.string(), smart: z.string() }).partial().optional(),
  outputLanguage: Lang.optional(),
  budgetUsd: z.number().nullable().optional(),
  concurrency: z.number().int().min(1).max(32).optional(),
});
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;

export const EstimateDTO = z.object({
  files: z.number(),
  filesNeedingSummary: z.number(),
  cachedSummaries: z.number(),
  llmCalls: z.number(),
  tokens: z.object({ in: z.number(), out: z.number() }),
  costUsd: z.number().nullable(),
  model: z.object({ fast: z.string(), smart: z.string() }),
  note: z.string().nullable(),
});
export type EstimateDTO = z.infer<typeof EstimateDTO>;

export const DiffImpactDTO = z.object({
  base: z.string(),
  head: z.string(),
  changedFiles: z.array(
    z.object({
      path: z.string(),
      status: z.enum(['added', 'modified', 'deleted', 'renamed']),
    }),
  ),
  changedNodes: z.array(NodeRef),
  affected: z.object({
    nodes: z.array(NodeRef.extend({ distance: z.number() })),
    features: z.array(
      z.object({
        featureId: z.string(),
        name: z.string(),
        changed: z.number(),
        affected: z.number(),
      }),
    ),
    routes: z.array(NodeRef),
  }),
  flagsTouched: z.array(FlagDTO),
  narrative: z.string().nullable(),
});
export type DiffImpactDTO = z.infer<typeof DiffImpactDTO>;

export const IndexRequest = z.object({
  mode: z.enum(['incremental', 'full']).optional().default('incremental'),
  ai: z.boolean().optional().default(true),
  budgetUsd: z.number().optional(),
  language: Lang.optional(),
});
export type IndexRequest = z.input<typeof IndexRequest>;

export const AskRequest = z.object({
  question: z.string().min(1),
  lang: Lang.optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional(),
});
export type AskRequest = z.infer<typeof AskRequest>;

export const GraphQuery = z.object({
  level: z.enum(['feature', 'module', 'file', 'symbol']).default('file'),
  focus: z.string().optional(),
  depth: z.number().default(2),
  feature: z.string().optional(),
  edgeKinds: z.array(EdgeKind).optional(),
  nodeKinds: z.array(NodeKind).optional(),
  provenance: z.array(Provenance).optional(),
  limit: z.number().default(400),
});
export type GraphQuery = z.input<typeof GraphQuery>;

export const FsBrowseDTO = z.object({
  path: z.string(),
  parent: z.string().nullable(),
  entries: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      isProject: z.boolean(),
      hasIndex: z.boolean(),
    }),
  ),
});
export type FsBrowseDTO = z.infer<typeof FsBrowseDTO>;

export const ProvidersDetectDTO = z.object({
  claudeCli: z.object({ found: z.boolean(), version: z.string().optional() }),
  ollama: z.object({ found: z.boolean(), models: z.array(z.string()) }),
  env: z.object({
    OPENROUTER_API_KEY: z.boolean(),
    ANTHROPIC_API_KEY: z.boolean(),
    OPENAI_API_KEY: z.boolean(),
  }),
});
export type ProvidersDetectDTO = z.infer<typeof ProvidersDetectDTO>;

export const TestProviderResult = z.object({
  ok: z.boolean(),
  model: z.string(),
  latencyMs: z.number(),
  message: z.string().optional(),
});
export type TestProviderResult = z.infer<typeof TestProviderResult>;

export const HealthResponse = z.object({
  ok: z.literal(true),
  version: z.string(),
  mock: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
