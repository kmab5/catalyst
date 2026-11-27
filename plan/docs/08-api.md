# 08 — API (HTTP + SSE + MCP)

The HTTP API is the **only** way the web UI talks to the engine. The MCP server and the Ask agent's tools use the same **query layer** (§3), so all three surfaces always agree. Every request and response shape is a Zod schema in `packages/shared/src/schemas/api.ts`. DTOs already defined in [05 §5](05-data-model.md#5-api-dtos-shared) are referenced by name here and not repeated.

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api`. Anything project-specific is under `/api/projects/:pid/...` |
| `:pid` | `Project.id`: the first 12 hex characters of sha1(absolute root path). Stable across launches |
| Node IDs in paths | Always `encodeURIComponent(id)`, e.g. `/nodes/sym%3Asrc%2Flib%2Fsession.ts%23getCurrentUser` |
| Content type | `application/json; charset=utf-8`. SSE endpoints use `text/event-stream` |
| Errors | Non-2xx → `{ "error": { "code": string, "message": string, "details"?: unknown } }` |
| Validation | The server parses query/body with shared Zod schemas. A failure returns `400 { error: { code: "BAD_REQUEST", details: zodIssues } }` |
| Binding | The server listens on **`127.0.0.1` only** by default. `--host` overrides this, and the CLI prints a warning when it does |
| Auth token | A random 32-byte hex token is generated each launch. All **mutating** endpoints (POST/PUT/DELETE) and **all `/api/settings*`** endpoints require the header `X-Catalyst-Token: <token>`. The token reaches the UI through the served `index.html` as `<meta name="catalyst-token" content="…">`, which the server injects when it serves the HTML. For dev builds served by Vite, it can instead come from `?token=` on the first-load URL, which the UI stores in `sessionStorage` and then removes from the URL. GETs other than settings need no token, because they bind to localhost and are read-only. |
| CORS | Off, since the UI is same-origin. In dev, the Vite dev server proxies `/api` to the API server |
| Mock mode | `pnpm --filter @catalyst/web dev:mock` runs the UI with a **Vite dev-server middleware** (`packages/web/mock/`) that answers every route in this table from `fixtures/index/taxonomy.json` (validated through the same DTOs); Ask/index SSE replay a scripted event sequence. It lives in `web`, not `server`, so the UI can be built without the engine or the server |
| Pagination | Lists that can be large take `?limit=` (default 50, max 500) and `?cursor=`. The response adds `nextCursor: string \| null` |
| Staleness | Every project-scoped response includes the header `X-Catalyst-Index: <runId>` so the UI can tell when it is showing data from an older index |

### Error codes

| Code | HTTP | When |
|---|---|---|
| `BAD_REQUEST` | 400 | Validation failed |
| `UNAUTHORIZED` | 401 | Token missing or wrong |
| `PROJECT_NOT_FOUND` | 404 | Unknown `:pid` |
| `NODE_NOT_FOUND` | 404 | Unknown node ID |
| `PATH_NOT_FOUND` | 404 | Open/browse on a missing path |
| `NOT_INDEXED` | 409 | A query on a project with `status = never-indexed` |
| `INDEX_RUNNING` | 409 | POST index while a run is active (the body includes the active `runId`) |
| `AI_NOT_CONFIGURED` | 412 | Ask/estimate/impact narrative with no provider set |
| `PROVIDER_ERROR` | 502 | The LLM provider failed (the message passes through, with keys redacted) |
| `INTERNAL` | 500 | Anything else |

### SSE framing

```
event: progress            // or: thinking | tool | token | done | error
id: 17
data: {"runId":"r_9f2c","stage":"parse","done":84,"total":129}

```

- Each `data` line is one JSON object of `ProgressEvent` (index runs) or `AskEvent` (Ask). The `event:` name equals `ProgressEvent.stage === 'done' | 'error'` → `done`/`error`, or `AskEvent.type`.
- The server sends `: ping` every 15 s.
- Index events have increasing `id`s, so a client that reconnects with `Last-Event-ID` receives the events it missed. The run keeps a bounded buffer of the last 500.
- The stream closes after `done` or `error`.

## 2. Endpoints

**Priority** uses the labels from [README](README.md). The DTOs that aren't defined in 05 are defined in §2.1.

### Global

| Method | Path | Query / Body | Response | Priority |
|---|---|---|---|---|
| GET | `/api/health` | — | `{ ok: true, version: string, mock: boolean }` | MVP |
| GET | `/api/settings` 🔒 | — | `SettingsDTO` (keys masked) | MVP |
| PUT | `/api/settings` 🔒 | `SettingsUpdate` (partial; send a key only to change it, and `null` to clear it) | `SettingsDTO` | MVP |
| POST | `/api/settings/test-provider` 🔒 | `{ provider?: ProviderConfig }` (omit it to test the saved config) | `{ ok: boolean, model: string, latencyMs: number, message?: string }` | MVP |
| GET | `/api/providers/detect` | — | `{ claudeCli: { found: boolean, version?: string }, ollama: { found: boolean, models: string[] }, env: { OPENROUTER_API_KEY: boolean, ANTHROPIC_API_KEY: boolean, OPENAI_API_KEY: boolean } }` | MVP |
| GET | `/api/fs/browse` | `?path=<abs>` (default: home dir) | `{ path: string, parent: string \| null, entries: { name: string, path: string, isProject: boolean, hasIndex: boolean }[] }` (directories only, hidden dirs excluded) | MVP |
| GET | `/api/projects` | — | `ProjectDTO[]` (open + recent, ordered by last opened) | MVP |
| POST | `/api/projects` 🔒 | `{ path: string }` (absolute, or `~`-relative) | `ProjectDTO` (opens or registers; does **not** start indexing) | MVP |
| GET | `/api/projects/:pid` | — | `ProjectDTO` | MVP |
| DELETE | `/api/projects/:pid` 🔒 | `?purge=true` also deletes `.catalyst/` | `{ ok: true }` (removes the project from recents) | Stretch |

🔒 = needs `X-Catalyst-Token` (every POST/PUT/DELETE needs it as well).

### Indexing

| Method | Path | Query / Body | Response | Priority |
|---|---|---|---|---|
| POST | `/api/projects/:pid/index` | `IndexRequest { mode?: 'incremental' \| 'full' = 'incremental', ai?: boolean = true, budgetUsd?: number, concurrency?: number, language?: 'en' \| 'tr' }` | `202 { runId: string }` | MVP |
| GET | `/api/projects/:pid/runs/:rid/events` | SSE | stream of `ProgressEvent` | MVP |
| GET | `/api/projects/:pid/runs/:rid` | — | `RunDTO` | MVP |
| POST | `/api/projects/:pid/runs/:rid/cancel` | — | `{ ok: true }` | MVP |
| POST | `/api/projects/:pid/estimate` | `{ language?: 'en' \| 'tr' }` | `EstimateDTO` | Stretch (MVP: the UI shows `ProjectDTO.stats.files`) |

### Understanding (read)

| Method | Path | Query / Body | Response | Priority |
|---|---|---|---|---|
| GET | `/api/projects/:pid/overview` | `?lang=` | `OverviewDTO` | MVP |
| GET | `/api/projects/:pid/features` | `?lang=` | `FeatureListItemDTO[]` | MVP |
| GET | `/api/projects/:pid/features/:fid` | `?lang=` | `Feature` (from 05, with `members[].node: NodeRef` hydrated) | MVP |
| GET | `/api/projects/:pid/tree` | `?path=` (subtree root, default `''`) `&depth=` (default ∞) | `TreeNodeDTO` | MVP |
| GET | `/api/projects/:pid/nodes/:id` | `?lang=` | `XRayDTO` | MVP |
| GET | `/api/projects/:pid/nodes/:id/source` | `?start=&end=` (1-based lines, inclusive; default: the node's range, or the whole file for `file:`; max 2,000 lines) | `SourceDTO` (raw text; **Shiki highlighting happens client-side**) | MVP |
| GET | `/api/projects/:pid/nodes/:id/impact` | `?direction=up\|down\|both` (default `both`) `&depth=` (1–6, default 3) `&kinds=` (CSV of edge kinds, default: all except `contains`, `member_of`) | `ImpactDTO` | MVP |
| GET | `/api/projects/:pid/graph` | `?level=feature\|module\|file\|symbol` (default `file`) `&focus=<nodeId>` `&depth=` (default 2, used with focus) `&feature=<fid>` `&edgeKinds=` `&nodeKinds=` `&provenance=` (CSV) `&limit=` (node cap, default 400) | `GraphDTO` + `{ truncated: boolean, totalNodes: number }` | MVP (`feature`, `file`) / Stretch (`module`, `symbol`) |

### Search & Ask

| Method | Path | Query / Body | Response | Priority |
|---|---|---|---|---|
| GET | `/api/projects/:pid/find` | `?q=` (≥ 1 char) `&kinds=` `&limit=` (default 20) | `FindResultDTO[]` | MVP |
| GET | `/api/projects/:pid/search` | `?q=` `&kind=` (`file\|symbol\|route\|db_model\|…`) `&limit=` (default 30) | `SearchResultDTO[]` | MVP |
| POST | `/api/projects/:pid/ask` | `{ question: string, lang?: 'en' \| 'tr', history?: { role: 'user' \| 'assistant', content: string }[] }` | SSE stream of `AskEvent` | MVP |
| GET | `/api/projects/:pid/asks` | — | `{ id, question, createdAt }[]` | Stretch |

The Ask request is a POST, so the UI consumes the SSE with `fetch` + `ReadableStream` rather than `EventSource`; see [10 §5](10-web-ui.md#5-state--data).

### Health & impact

| Method | Path | Query / Body | Response | Priority |
|---|---|---|---|---|
| GET | `/api/projects/:pid/health` | `?severity=&rule=&feature=` | `HealthDTO` | MVP |
| POST | `/api/projects/:pid/impact/diff` | `{ base?: string /* git ref; default: uncommitted vs HEAD */, narrative?: boolean = true, lang?: 'en' \| 'tr' }` | `DiffImpactDTO` | Stretch |

### 2.1 Additional DTOs

```ts
// shared/schemas/api.ts (in addition to NodeRef, XRayDTO, ImpactDTO, GraphDTO, AskEvent, AskAnswer, ProgressEvent from 05)

const ProjectStatus = z.enum(['never-indexed', 'indexing', 'ready', 'stale', 'error']);

const ProjectDTO = z.object({
  id: z.string(),
  name: z.string(),                         // basename of root
  root: z.string(),                         // absolute path (local only; hidden in hosted mode later)
  status: ProjectStatus,
  aiStatus: z.enum(['done', 'partial', 'skipped', 'none']),  // none = never ran
  activeRunId: z.string().nullable(),
  lastRunId: z.string().nullable(),         // last completed run; compared with the X-Catalyst-Index header
  lastIndexedAt: z.number().nullable(),     // epoch ms
  lastOpenedAt: z.number(),
  outputLanguage: z.enum(['en', 'tr']),
  stats: z.object({
    files: z.number(), analysedFiles: z.number(), symbols: z.number(), edges: z.number(),
    features: z.number(), flags: z.number(),
    languages: z.array(z.object({ language: z.string(), files: z.number(), tier: z.number() })),
  }).nullable(),
});

const RunDTO = z.object({
  id: z.string(), status: z.enum(['running', 'done', 'error', 'cancelled']),
  startedAt: z.number(), finishedAt: z.number().nullable(),
  lastEvent: ProgressEvent.nullable(),
  stats: z.object({
    stageMs: z.record(z.string(), z.number()),
    tokens: z.object({ in: z.number(), out: z.number() }),
    llmCalls: z.number(), cacheHits: z.number(), costUsdEstimate: z.number().nullable(),
    errors: z.array(z.string()).optional(), repairs: z.record(z.string(), z.number()).optional(),
  }).nullable(),
  error: z.string().nullable(),
});

const OverviewDTO = z.object({
  overview: AppOverview.nullable(),         // null when aiStatus is skipped/none
  stack: z.array(z.object({ name: z.string(), category: z.string(), evidence: z.array(z.string()) })), // deterministic, always present
  features: z.array(z.lazy(() => FeatureListItemDTO)),
  entryPoints: z.array(NodeRef),
  health: z.object({ high: z.number(), warn: z.number(), info: z.number(), topFlags: z.array(z.lazy(() => FlagDTO)).max(5) }),
  project: ProjectDTO,
});

const FeatureListItemDTO = z.object({
  id: z.string(), name: z.string(), category: Feature.shape.category, summary: z.string(),
  memberCount: z.number(), entryPointCount: z.number(), flowCount: z.number(),
  flagCount: z.number(), colorIndex: z.number(),   // stable index into the UI's feature palette
  changeabilityRating: z.enum(['easy', 'moderate', 'hard']).nullable(),
});

const TreeNodeDTO: z.ZodType<TreeNode> = z.lazy(() => z.object({
  id: z.string(),                           // dir:… or file:…
  name: z.string(), path: z.string(),
  type: z.enum(['dir', 'file']),
  language: z.string().nullable(), tier: z.number().nullable(),
  featureIds: z.array(z.string()),          // for colour dots (files: own features; dirs: union of children's, top 3)
  flagCount: z.number(),
  role: FileSummary.shape.role.nullable(),  // from the summary, files only
  children: z.array(TreeNodeDTO).optional(),
}));

const SourceDTO = z.object({
  nodeId: z.string(), filePath: z.string(), language: z.string(),
  startLine: z.number(), endLine: z.number(), totalLines: z.number(),
  text: z.string(),
  outline: z.array(z.object({ nodeId: z.string(), name: z.string(), symbolKind: z.string(), startLine: z.number(), endLine: z.number(), depth: z.number() })),
});

const FindResultDTO = z.object({
  node: NodeRef, score: z.number(),         // 0..1
  matchRanges: z.array(z.tuple([z.number(), z.number()])),  // [start,end) in node.name for highlighting
  context: z.string().nullable(),           // e.g. file path for symbols, "POST" for routes
});

const SearchResultDTO = z.object({
  node: NodeRef, score: z.number(),         // bm25 normalised
  field: z.enum(['name', 'path', 'summary', 'tags', 'code']),  // best-matching field
  snippet: z.string(),                      // FTS5 snippet() with «» around matches
  purpose: z.string().nullable(),           // summary purpose if available
});

// FlagDTO, NodeDTO, EdgeRefDTO, Lang, Severity, FeatureDetailDTO are defined in 05-data-model.md §5.

const HealthDTO = z.object({
  summary: z.object({ high: z.number(), warn: z.number(), info: z.number(), byRule: z.record(z.string(), z.number()) }),
  flags: z.array(FlagDTO),
  cycles: z.array(z.object({ id: z.string(), nodes: z.array(NodeRef), size: z.number() })),
  metrics: z.object({
    topFanIn: z.array(z.object({ node: NodeRef, value: z.number() })),
    topComplexity: z.array(z.object({ node: NodeRef, value: z.number() })),
    largestFiles: z.array(z.object({ node: NodeRef, value: z.number() })),
    featureCoupling: z.array(z.object({ from: z.string(), to: z.string(), edges: z.number() })),   // Stretch UI
  }),
});

// ProviderConfig is the discriminated union in shared/schemas/config.ts (12 §2):
//   type: 'openrouter' | 'anthropic' | 'openai-compatible' | 'claude-code', plus apiKey/baseUrl/binary per type.
const ProviderType = z.enum(['openrouter', 'anthropic', 'openai-compatible', 'claude-code']);

const SettingsDTO = z.object({
  provider: z.object({
    type: ProviderType,
    baseUrl: z.string().nullable(),         // openai-compatible / openrouter
    binary: z.string().nullable(),          // claude-code
    apiKeyMasked: z.string().nullable(),    // "sk-or-…4f2a" or null; never the real key
    apiKeySource: z.enum(['config', 'env', 'none']),
    autoDetected: z.boolean(),              // true when picked by the 12 §2 selection order, not saved config
  }).nullable(),
  models: z.object({ fast: z.string(), smart: z.string() }),
  outputLanguage: z.enum(['en', 'tr']),
  budgetUsd: z.number().nullable(),         // per index run cap
  concurrency: z.number().int().min(1).max(32),
  telemetry: z.literal(false),
});
const SettingsUpdate = z.object({
  // The discriminated provider patch requires type. Other provider fields are optional.
  // Omit apiKey to preserve its source. Use apiKey: null to clear it, or provider: null to disconnect.
  provider: ProviderPatch.nullable().optional(),
  models: z.object({ fast: z.string(), smart: z.string() }).partial().optional(),
  outputLanguage: z.enum(['en', 'tr']).optional(),
  budgetUsd: z.number().nullable().optional(),
  concurrency: z.number().int().min(1).max(32).optional(),
});

const EstimateDTO = z.object({                // Stretch
  files: z.number(), filesNeedingSummary: z.number(), cachedSummaries: z.number(),
  llmCalls: z.number(),
  tokens: z.object({ in: z.number(), out: z.number() }),
  costUsd: z.number().nullable(),           // null for claude-code / local models
  model: z.object({ fast: z.string(), smart: z.string() }),
  note: z.string().nullable(),              // e.g. "Billed to your Claude plan"
});

const DiffImpactDTO = z.object({              // Stretch
  base: z.string(), head: z.string(),       // "HEAD" / "WORKTREE"
  changedFiles: z.array(z.object({ path: z.string(), status: z.enum(['added', 'modified', 'deleted', 'renamed']) })),
  changedNodes: z.array(NodeRef),           // symbols whose line ranges intersect the hunks
  affected: z.object({
    nodes: z.array(NodeRef.extend({ distance: z.number() })),   // upstream dependants (depth 3)
    features: z.array(z.object({ featureId: z.string(), name: z.string(), changed: z.number(), affected: z.number() })),
    routes: z.array(NodeRef),
  }),
  flagsTouched: z.array(FlagDTO),
  narrative: z.string().nullable(),         // AI markdown with [[nodeId]] citations; risks + what to test
});
```

## 3. Query layer (`core/query`)

There is one function per capability. HTTP handlers, Ask tools and MCP tools are all thin wrappers over these. Each is synchronous unless marked `async`, since SQLite reads are synchronous.

```ts
interface QueryApi {
  // project-level
  getProject(): ProjectDTO;
  getOverview(lang: Lang): OverviewDTO;
  getStack(): OverviewDTO['stack'];

  // features
  listFeatures(lang: Lang): FeatureListItemDTO[];
  getFeature(featureId: string, lang: Lang): Feature;                       // members hydrated with NodeRef
  featuresOf(nodeId: string): { id: string; name: string; role: string }[];

  // nodes
  getNode(nodeId: string): NodeDTO;                                          // throws NODE_NOT_FOUND
  getXRay(nodeId: string, lang: Lang): XRayDTO;
  getSource(nodeId: string, range?: { start: number; end: number }): Promise<SourceDTO>;  // reads from Source
  getTree(rootPath?: string, depth?: number): TreeNodeDTO;
  listNodes(filter: { kinds?: NodeKind[]; filePath?: string; featureId?: string; limit?: number }): NodeRef[];

  // graph
  neighbours(nodeId: string, opts: { direction: 'up' | 'down' | 'both'; edgeKinds?: EdgeKind[] }): EdgeRefDTO[];
  impact(nodeId: string, opts: { direction: 'up' | 'down' | 'both'; depth: number; edgeKinds?: EdgeKind[] }): ImpactDTO;
  graph(opts: GraphQuery): GraphDTO & { truncated: boolean; totalNodes: number };
  pathsBetween(fromId: string, toId: string, opts?: { maxDepth?: number; maxPaths?: number }): string[][];  // used for flow validation + Ask

  // search
  find(q: string, opts?: { kinds?: NodeKind[]; limit?: number }): FindResultDTO[];
  search(q: string, opts?: { kind?: NodeKind; limit?: number }): SearchResultDTO[];
  routes(filter?: { method?: string; pathPrefix?: string }): NodeRef[];      // Ask helper
  dataAccess(modelId?: string): { model: NodeRef; readers: NodeRef[]; writers: NodeRef[] }[];  // Ask helper

  // health
  getHealth(filter?: { severity?: Severity; rule?: string; featureId?: string }): HealthDTO;
  flagsFor(nodeId: string): FlagDTO[];

  // impact (Stretch)
  diffImpact(spec: { base?: string }): Promise<Omit<DiffImpactDTO, 'narrative'>>;
}
```

### Ask agent tools (wrap the query layer; see [06 §7](06-analysis-pipeline.md))

| Tool | Wraps | Purpose |
|---|---|---|
| `search_code(query, kind?)` | `search` | Full-text search over names, paths, summaries, tags and code |
| `find_symbol(name, kinds?)` | `find` | Fuzzy name lookup |
| `get_node(id)` | `getXRay` (trimmed) | Purpose, connections, side effects |
| `get_feature(id)` / `list_features()` | `getFeature` / `listFeatures` | The semantic layer |
| `get_impact(id, direction, depth)` | `impact` | Blast radius |
| `list_routes(method?, pathPrefix?)` | `routes` | Entry points |
| `data_access(modelId?)` | `dataAccess` | Who reads/writes which model |
| `paths_between(from, to)` | `pathsBetween` | "Does X reach Y?" (e.g. does the route reach the auth check) |
| `read_source(id, start?, end?)` | `getSource` (max 200 lines per call) | Read the code to confirm |

Every tool call is logged as an `AskEvent { type: 'tool' }`. The agent's arguments become part of `AskAnswer.searched`.

## 4. MCP server *(Stretch)*

- **Transport:** stdio, via `@modelcontextprotocol/sdk`. Entry point: `catalyst mcp [path]` (default: cwd).
- **Startup:** it opens the project DB. If the project is `never-indexed`, it runs a **structural-only** index first (no AI, quick) and logs progress to stderr. If `stale`, it serves the existing data and includes `"stale": true` in every result.
- **Output:** each tool returns one `text` content item containing pretty JSON. Node IDs are kept intact so the agent can chain calls. Arrays are capped (default 50) and include `"truncated": true` when cut.
- **Server name:** `catalyst`. Instructions string: *"Catalyst has indexed this repository into a graph of files, symbols, routes, DB models, env vars, external services and AI-discovered features. Prefer these tools over grep for: where something is implemented, who calls/depends on a symbol, what a change would affect, and architectural issues. Node IDs look like `file:src/a.ts`, `sym:src/a.ts#fn`, `route:POST /api/x`, `feature:billing`."*

| Tool | Input schema | Output | Description (as written for the agent) |
|---|---|---|---|
| `get_overview` | `{}` | `OverviewDTO` (no `project.root`) | "High-level summary of the app: purpose, stack, features, entry points, known gaps. Call this first in an unfamiliar repo." |
| `list_features` | `{}` | `FeatureListItemDTO[]` | "List the app's features (e.g. Authentication, Billing) with IDs. Use the IDs with get_feature." |
| `get_feature` | `{ featureId: string }` | `Feature` | "Everything about one feature: entry points, member files/symbols by role, request flows, data models, external services, and how hard it is to change." |
| `find_symbol` | `{ name: string, kinds?: NodeKind[], limit?: number }` | `FindResultDTO[]` | "Fuzzy-find files, functions, classes, components and routes by name. Returns node IDs." |
| `search` | `{ query: string, kind?: NodeKind, limit?: number }` | `SearchResultDTO[]` | "Full-text search over code AND plain-English summaries/tags. Use it for concepts ('stripe webhook', 'password hashing') when you don't know the name." |
| `get_symbol_context` | `{ id: string }` (ID or a path like `src/lib/session.ts`) | `XRayDTO` + `{ source?: string }` (first 120 lines when `includeSource`) | "What a file/symbol does, where it sits in the app, its direct callers and callees, side effects (DB, network, env), owning features and health flags. Call before modifying code." |
| `get_blast_radius` | `{ id: string, direction?: 'up'\|'down'\|'both', depth?: number }` | `ImpactDTO` | "What depends on this node (up) and what it depends on (down), grouped by feature and route. Call before changing a signature or deleting code." |
| `find_architectural_issues` | `{ severity?: Severity, rule?: string, featureId?: string, path?: string }` | `{ flags: FlagDTO[], cycles: HealthDTO['cycles'] }` | "Structural problems: circular dependencies, god files/functions, risky hubs, unused exports, needless indirection. Filter by path or feature." |
| `get_diff_impact` | `{ base?: string }` | `DiffImpactDTO` (no narrative unless AI is configured) | "Map uncommitted (or branch vs base) changes to the features, routes and code they affect. Use it to decide what to test." |
| `ask` | `{ question: string }` | `AskAnswer` | "Ask a free-form question about the codebase. Returns an answer with cited node IDs; found=false means it searched and could not find it. Slower; prefer specific tools when they fit." |

### Registration snippets

Claude Code:

```bash
claude mcp add catalyst -- npx -y catalyst-dx mcp
# or, pinned to a specific repo:
claude mcp add catalyst -- npx -y catalyst-dx mcp /abs/path/to/repo
```

Cursor (`.cursor/mcp.json` in the repo, or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "catalyst": {
      "command": "npx",
      "args": ["-y", "catalyst-dx", "mcp"]
    }
  }
}
```
