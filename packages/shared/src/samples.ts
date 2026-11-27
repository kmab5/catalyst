import { ids } from './ids.js';
import type * as Contract from './index.js';

const path = 'lib/session.ts';
const file = ids.file(path);
const route = ids.route('POST', '/api/webhooks/stripe');
const billing = ids.feature('Billing');
const model = ids.db('prisma', 'User');
const models = { fast: 'haiku', smart: 'sonnet' };
const tokens = { in: 1200, out: 180 };
const ease = { level: 'moderate', reason: 'Changes require updating the session consumer.' } as const;

export const sampleNodeKind: Contract.NodeKind = 'file';
export const sampleEdgeKind: Contract.EdgeKind = 'reads';
export const sampleProvenance: Contract.Provenance = 'ast';
export const sampleSeverity: Contract.Severity = 'warn';
export const sampleLang: Contract.Lang = 'en';
export const sampleSymbolKind: Contract.SymbolKind = 'function';
export const sampleNodeRef: Contract.NodeRef = { id: file, kind: 'file', name: 'session.ts', filePath: path, startLine: 1, provenance: 'ast' };
export const sampleNodeDTO: Contract.NodeDTO = { ...sampleNodeRef, endLine: 18, symbolKind: null, exported: false, signature: null,
  confidence: 1, tier: 1, data: null, metrics: { loc: 18, fan_in: 2 } };
export const sampleEdgeRefDTO: Contract.EdgeRefDTO = { kind: 'imports', provenance: 'resolved', confidence: 1, node: sampleNodeRef, line: 2, filePath: 'app/account/page.tsx' };
export const sampleFlagDTO: Contract.FlagDTO = { id: 'hub:' + file, rule: 'hub', severity: 'warn', node: sampleNodeRef, title: 'Several files depend on this helper',
  explanation: null, evidence: { metrics: { fan_in: 16 }, nodeIds: [file] } };
export const sampleSideEffect: Contract.SideEffect = { kind: 'db_read', description: 'Reads the current user.', target: model };
export const sampleFileSummary: Contract.FileSummary = { nodeId: file, purpose: 'Finds the signed-in user.', details: 'Loads the active session for server-side handlers.',
  role: 'auth', positionInApp: 'Used before opening an account page.', sideEffects: [sampleSideEffect], tags: ['auth','session'],
  symbols: [{ nodeId: ids.sym(path, 'getCurrentUser'), purpose: 'Reads the current user.' }], featureHints: ['Authentication'], confidence: 0.9 };
export const sampleModuleSummary: Contract.ModuleSummary = { nodeId: ids.dir('lib'), purpose: 'Shared application helpers.', details: 'Contains session and billing helpers.',
  keyFiles: [file], tags: ['session'] };
export const sampleEase: Contract.Ease = 'moderate';
export const sampleChangeability: Contract.Changeability = { addEase: ease, changeEase: ease, removeEase: ease, touchpoints: [file],
  risks: [{ text: 'Customers need an active session.', nodeIds: [file] }], couplings: [], citesMetrics: [{ name: 'fan_in', value: 2, nodeId: file }],
  summary: 'Changes to billing may require updating session handling.' };
export const sampleFeatureMember: Contract.FeatureMember = { nodeId: file, role: 'support', reason: 'Identifies the customer.' };
export const sampleFlowStep: Contract.FlowStep = { nodeId: route, action: 'Receives a Stripe event.', edgeVerified: false };
export const sampleFlow: Contract.Flow = { id: 'flow:billing:webhook', name: 'Process a subscription update', trigger: 'Stripe posts a webhook.',
  steps: [sampleFlowStep, { nodeId: model, action: 'Updates the subscription.', edgeVerified: true }] };
export const sampleFeature: Contract.Feature = { id: billing, name: 'Billing', category: 'payments', summary: 'Manages paid subscriptions.',
  description: 'Receives subscription events from Stripe.', entryPoints: [route], members: [sampleFeatureMember], flows: [sampleFlow],
  dependsOn: [], services: [ids.svc('stripe')], dataModels: [model], changeability: sampleChangeability, confidence: 0.89 };
export const sampleFeatureDetailDTO: Contract.FeatureDetailDTO = { ...sampleFeature, members: [{ ...sampleFeatureMember, node: sampleNodeRef }] };
export const sampleAppOverview: Contract.AppOverview = { name: 'Taxonomy', oneLiner: 'A blogging platform with subscriptions.', description: 'Authors publish for paid subscribers.',
  audience: 'Authors and subscribers', stack: [{ name: 'Next.js', category: 'framework', evidence: [ids.file('package.json')] }],
  architecture: 'Next.js pages read account data through Prisma.', featureIds: [billing], entryPoints: [route], gaps: [] };
export const sampleXRayDTO: Contract.XRayDTO = { node: sampleNodeDTO, summary: sampleFileSummary, symbolPurpose: null, features: [{ id: billing, name: 'Billing', role: 'support' }],
  upstream: [sampleEdgeRefDTO], downstream: [], sideEffects: [sampleSideEffect], flags: [sampleFlagDTO],
  impactPreview: { dependants: 2, features: [billing], routes: [] } };
export const sampleImpactDTO: Contract.ImpactDTO = { root: model, direction: 'up', depth: 3, nodes: [{ ...sampleNodeRef, distance: 1, direction: 'up' }],
  edges: [sampleEdgeRefDTO], byFeature: [{ featureId: billing, count: 1 }], routes: [route], truncated: false };
export const sampleGraphDTO: Contract.GraphDTO = { level: 'file', nodes: [{ id: file, label: 'session.ts', kind: 'file', parent: null, featureId: billing, size: 18, flags: 1 }], edges: [] };
export const sampleAskAnswer: Contract.AskAnswer = { markdown: 'The session helper identifies the current user. [[' + file + ']]', found: true, citations: [sampleNodeRef], searched: ['session'] };
export const sampleAskEvent: Contract.AskEvent = { type: 'done', answer: sampleAskAnswer };
export const sampleProgressEvent: Contract.ProgressEvent = { runId: 'run-1', stage: 'done', done: 12, total: 12 };
export const sampleProjectStatus: Contract.ProjectStatus = 'ready';
export const sampleProjectDTO: Contract.ProjectDTO = { id: '7b42a0fc3170', name: 'taxonomy', root: '/repos/taxonomy', status: 'ready', aiStatus: 'done',
  activeRunId: null, lastRunId: 'run-1', lastIndexedAt: 1780000000000, lastOpenedAt: 1780000001000, outputLanguage: 'en',
  stats: { files: 12, analysedFiles: 11, symbols: 24, edges: 61, features: 2, flags: 1, languages: [{ language: 'typescript', files: 12, tier: 1 }] } };
export const sampleRunDTO: Contract.RunDTO = { id: 'run-1', status: 'done', startedAt: 1780000000000, finishedAt: 1780000001000, lastEvent: sampleProgressEvent,
  stats: { stageMs: { scan: 12 }, tokens, llmCalls: 3, cacheHits: 1, costUsdEstimate: null }, error: null };
export const sampleFeatureListItemDTO: Contract.FeatureListItemDTO = { id: billing, name: 'Billing', category: 'payments', summary: sampleFeature.summary, memberCount: 1,
  entryPointCount: 1, flowCount: 1, flagCount: 1, colorIndex: 2, changeabilityRating: 'moderate' };
export const sampleOverviewDTO: Contract.OverviewDTO = { overview: sampleAppOverview, stack: sampleAppOverview.stack, features: [sampleFeatureListItemDTO], entryPoints: [],
  health: { high: 0, warn: 1, info: 0, topFlags: [sampleFlagDTO] }, project: sampleProjectDTO };
export const sampleTreeNodeDTO: Contract.TreeNodeDTO = { id: ids.dir('lib'), name: 'lib', path: 'lib', type: 'dir', language: null, tier: null, featureIds: [billing],
  flagCount: 1, role: null, children: [{ id: file, name: 'session.ts', path, type: 'file', language: 'typescript', tier: 1, featureIds: [billing], flagCount: 1, role: 'auth' }] };
export const sampleSourceDTO: Contract.SourceDTO = { nodeId: file, filePath: path, language: 'typescript', startLine: 1, endLine: 1, totalLines: 1,
  text: 'export const session = getSession();', outline: [] };
export const sampleFindResultDTO: Contract.FindResultDTO = { node: sampleNodeRef, score: 1, matchRanges: [[0,7]], context: path };
export const sampleSearchResultDTO: Contract.SearchResultDTO = { node: sampleNodeRef, score: 1, field: 'name', snippet: '«session».ts', purpose: sampleFileSummary.purpose };
export const sampleHealthDTO: Contract.HealthDTO = { summary: { high: 0, warn: 1, info: 0, byRule: { hub: 1 } }, flags: [sampleFlagDTO], cycles: [],
  metrics: { topFanIn: [{ node: sampleNodeRef, value: 16 }], topComplexity: [], largestFiles: [], featureCoupling: [] } };
export const sampleProviderType: Contract.ProviderType = 'claude-code';
export const sampleProviderConfig: Contract.ProviderConfig = { type: 'claude-code', binary: 'claude' };
export const sampleGlobalConfig: Contract.GlobalConfig = { version: 1, provider: sampleProviderConfig, models, outputLanguage: 'en', budgetUsd: null, concurrency: 6, telemetry: false };
export const sampleSettingsDTO: Contract.SettingsDTO = { provider: { type: 'claude-code', baseUrl: null, binary: 'claude', apiKeyMasked: null, apiKeySource: 'none', autoDetected: true },
  models, outputLanguage: 'en', budgetUsd: null, concurrency: 6, telemetry: false };
export const sampleSettingsUpdate: Contract.SettingsUpdate = { models: { smart: 'sonnet' }, concurrency: 4 };
export const sampleEstimateDTO: Contract.EstimateDTO = { files: 12, filesNeedingSummary: 7, cachedSummaries: 5, llmCalls: 9, tokens, costUsd: null, model: models, note: 'Billed to your Claude plan' };
export const sampleDiffImpactDTO: Contract.DiffImpactDTO = { base: 'HEAD', head: 'WORKTREE', changedFiles: [{ path, status: 'modified' }], changedNodes: [sampleNodeRef],
  affected: { nodes: [], features: [{ featureId: billing, name: 'Billing', changed: 1, affected: 0 }], routes: [] }, flagsTouched: [sampleFlagDTO], narrative: null };
export const sampleErrorCode: Contract.ErrorCode = 'NODE_NOT_FOUND';
export const sampleErrorBody: Contract.ErrorBody = { error: { code: sampleErrorCode, message: 'The requested node is absent from the index.' } };
export const sampleIndexRequest: Contract.IndexRequest = { mode: 'incremental', ai: true };
export const sampleAskRequest: Contract.AskRequest = { question: 'Where is the signed-in user loaded?', history: [] };
export const sampleGraphQuery: Contract.GraphQuery = { level: 'file', depth: 2, limit: 400 };
export const sampleGraphResponse: Contract.GraphResponse = { ...sampleGraphDTO, truncated: false, totalNodes: 1 };
export const sampleFsBrowseDTO: Contract.FsBrowseDTO = { path: '/repos', parent: '/', entries: [{ name: 'taxonomy', path: '/repos/taxonomy', isProject: true, hasIndex: true }] };
export const sampleProvidersDetectDTO: Contract.ProvidersDetectDTO = { claudeCli: { found: true, version: '1.0' }, ollama: { found: false, models: [] },
  env: { OPENROUTER_API_KEY: false, ANTHROPIC_API_KEY: false, OPENAI_API_KEY: false } };
export const sampleTestProviderResult: Contract.TestProviderResult = { ok: true, model: 'haiku', latencyMs: 120 };
export const sampleHealthResponse: Contract.HealthResponse = { ok: true, version: '0.1.0', mock: false };
