# 05 — Data Model

This is the contract between the engine, the API, the UI and the LLM stages. The canonical form is the Zod schemas in `packages/shared/src/schemas/`, and this doc describes them. If the two disagree, update both in the same `contract:` commit.

## 1. The graph

### 1.1 Node kinds

| `kind` | What it is | Created by | Example ID |
|---|---|---|---|
| `directory` | A folder (module) | scanner | `dir:src/lib` |
| `file` | A source file | scanner | `file:src/lib/session.ts` |
| `symbol` | Function, class, method, variable, type, interface or component defined in a file | parser | `sym:src/lib/session.ts#getCurrentUser` |
| `route` | HTTP endpoint or UI page that is an entry point | detector | `route:POST /api/webhooks/stripe`, `route:PAGE /dashboard/billing` |
| `db_model` | A table/collection/model | detector | `db:prisma:User`, `db:supabase:profiles`, `db:sqlalchemy:Item` |
| `env_var` | An environment variable that is read | detector | `env:STRIPE_API_KEY` |
| `package` | An external dependency (npm/PyPI) | resolver | `pkg:npm:next-auth`, `pkg:pypi:fastapi` |
| `service` | An external service that is talked to (a semantic grouping of packages and hosts) | detector | `svc:stripe`, `svc:github-oauth`, `svc:postmark` |
| `feature` | An AI-discovered capability (semantic layer, see §3) | AI stage | `feature:billing` |

`symbol` nodes have a `symbolKind`: `function | class | method | variable | type | interface | enum | component | hook`.

**ID rules** (implemented in `shared/ids.ts`; never build ID strings by hand):
- Method: `sym:<path>#<Class>.<method>`. Default export: `sym:<path>#default`. Duplicate names in the same file get a `@<line>` suffix (`sym:a.ts#handler@42`).
- IDs are stable across re-indexes as long as the path and name stay the same, which lets the cache and the UI's deep links survive a re-index.
- In URLs, IDs are always passed through `encodeURIComponent`.

### 1.2 Edge kinds

| `kind` | From → To | Meaning |
|---|---|---|
| `contains` | directory→directory/file, file→symbol, symbol→symbol (class→method) | Structural containment |
| `imports` | file → file / package | The file imports from the target |
| `calls` | symbol → symbol | Function/method invocation |
| `references` | symbol → symbol | Non-call use (passed as a value, type reference, `extends`) |
| `renders` | symbol(component) → symbol(component) | JSX usage `<Foo/>` |
| `extends` / `implements` | symbol → symbol | Class inheritance / interface implementation |
| `handles` | route → symbol | The route's handler (Next.js `export async function POST`, `@app.get`, `app.post(...)`) |
| `reads` / `writes` | symbol → db_model | DB access (`prisma.user.findMany` = reads, `.create/.update/.delete/.upsert` = writes) |
| `uses_env` | symbol/file → env_var | `process.env.X`, `os.environ["X"]`, `os.getenv("X")` |
| `calls_service` | symbol/file → service | Uses an SDK client / fetches a known host |
| `depends_on` | package → service | Package-to-service mapping (e.g. `stripe` → `svc:stripe`) |
| `member_of` | any → feature | Feature membership (with a `role`; see §3) |
| `feature_depends` | feature → feature | Derived: one feature's members depend on another's |

### 1.3 Provenance & confidence

Every node and edge carries:

```ts
provenance: 'ast' | 'resolved' | 'heuristic' | 'inferred'
confidence: number   // 0..1; ast/resolved = 1.0, heuristic = 0.5–0.8, inferred = the LLM's self-reported value, capped at 0.9
```

- `ast`: read straight from the syntax tree (definitions, containment, a local call to a local function).
- `resolved`: followed an import binding to its definition.
- `heuristic`: matched by name or pattern without a binding (Tier 2, or an ambiguous member call).
- `inferred`: produced by an LLM (Tier 3 extraction, feature membership, flows).

The UI shows these as the badges `AST`, `Resolved`, `Heuristic` and `AI-inferred`.

## 2. Summaries (AI layer, per node)

```ts
// shared/schemas/summary.ts
const SideEffect = z.object({
  kind: z.enum(['db_read','db_write','network','filesystem','env','state','auth','email','payment','log','other']),
  description: z.string(),              // plain English: "Creates a Stripe checkout session"
  target: z.string().optional(),        // node ID if known: "db:prisma:User", "svc:stripe"
});

const FileSummary = z.object({
  nodeId: z.string(),                   // file:... 
  purpose: z.string(),                  // ≤ 2 sentences, plain English, no jargon
  details: z.string(),                  // ≤ 6 sentences; may use technical terms
  role: z.enum(['page','layout','ui_component','api_handler','server_action','middleware','service','data_access',
                'model','schema','auth','config','util','hook','types','test','script','styles','other']),
  positionInApp: z.string(),            // "Runs when a user visits /dashboard/billing; called by …"
  sideEffects: z.array(SideEffect),
  tags: z.array(z.string()).max(12),    // lowercase search words: ["stripe","checkout","subscription"]
  symbols: z.array(z.object({ nodeId: z.string(), purpose: z.string() })), // key symbols only
  featureHints: z.array(z.string()).max(5),  // free-text guesses ("billing"); used by feature discovery
  confidence: z.number().min(0).max(1),
});

const ModuleSummary = z.object({          // for directory nodes
  nodeId: z.string(), purpose: z.string(), details: z.string(),
  keyFiles: z.array(z.string()), tags: z.array(z.string()),
});
```

All AI-written text is in the project's `outputLanguage` (`en` by default; `tr` is Stretch). Identifiers, paths and IDs are never translated.

## 3. Features, flows, overview

```ts
const FeatureMember = z.object({
  nodeId: z.string(),
  role: z.enum(['entry','core','support','data','ui','config','test']),
  reason: z.string().optional(),       // why it belongs (short)
});

const FlowStep = z.object({
  nodeId: z.string(),
  action: z.string(),                  // "Verifies the Stripe signature"
  edgeVerified: z.boolean(),           // true if a graph path exists from the previous step (set by the engine, not the LLM)
  confidence: z.number().optional(),   // LLM self-report for unverified steps
});

const Flow = z.object({
  id: z.string(),                      // "flow:billing:checkout"
  name: z.string(),                    // "Upgrade to Pro"
  trigger: z.string(),                 // "User clicks Upgrade on /dashboard/billing"
  steps: z.array(FlowStep).min(2),
});

const Feature = z.object({
  id: z.string(),                      // "feature:billing" (slug of name, unique)
  name: z.string(),                    // "Billing & Subscriptions"
  category: z.enum(['auth','data','payments','ui','api','content','notifications','integration','admin','infra','analytics','core','other']),
  summary: z.string(),                 // 1 sentence
  description: z.string(),             // a paragraph, plain English
  entryPoints: z.array(z.string()),    // route/page/CLI node IDs
  members: z.array(FeatureMember),
  flows: z.array(Flow),
  dependsOn: z.array(z.string()),      // feature IDs (derived from graph edges, then confirmed)
  services: z.array(z.string()),       // svc:* used
  dataModels: z.array(z.string()),     // db:* touched
  changeability: Changeability.optional(),  // imported from shared/schemas/changeability.ts, defined in 11 §4.1
  confidence: z.number(),
});
```

**The synthetic `feature:shared`** ("Shared code") collects files that no discovered feature claims, after the coverage pass ([06 §5.4](06-analysis-pipeline.md)). It always exists when there are unassigned files. It is excluded from `dependsOn`, and it is listed last in the UI.

```ts

const AppOverview = z.object({
  name: z.string(),
  oneLiner: z.string(),                // "A blogging platform with paid subscriptions"
  description: z.string(),             // 1–3 paragraphs
  audience: z.string(),                // who uses the app
  stack: z.array(z.object({ name: z.string(), category: z.string(), evidence: z.array(z.string()) })),  // deterministic first, AI-polished
  architecture: z.string(),            // how the parts fit together (plain English)
  featureIds: z.array(z.string()),
  entryPoints: z.array(z.string()),
  gaps: z.array(z.string()),           // "No automated tests found", "No rate limiting on API routes"
});
```

Every node ID inside AI output is **validated against the store** before it is saved. Unknown IDs are dropped, and if dropping them would empty a required array, the item is retried once and then discarded.

## 4. SQLite schema (`.catalyst/catalyst.db`)

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: schema_version, project_root, last_index_at, ai_status, output_language, prompt_version, stack_json

CREATE TABLE files (
  path TEXT PRIMARY KEY,                 -- repo-relative POSIX
  hash TEXT NOT NULL,                    -- sha1 of content
  language TEXT NOT NULL,                -- typescript|tsx|javascript|jsx|python|go|... |unknown
  tier INTEGER NOT NULL,                 -- 1|2|3|0 (0 = not analysed: binary, asset)
  loc INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  parsed_hash TEXT,                      -- hash at last successful parse (NULL = needs parse)
  parse_error TEXT
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                    -- see §1.1
  name TEXT NOT NULL,                    -- display name
  file_path TEXT,                        -- owning file (NULL for package/service/env/feature/db when global)
  start_line INTEGER, end_line INTEGER,
  symbol_kind TEXT,                      -- for kind=symbol
  exported INTEGER NOT NULL DEFAULT 0,
  signature TEXT,                        -- e.g. "getCurrentUser(): Promise<User | null>"
  provenance TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 1.0,
  data TEXT                              -- JSON: kind-specific extras (route method/path, db orm, isTest, client: true for 'use client', etc.)
);
CREATE INDEX nodes_file ON nodes(file_path);
CREATE INDEX nodes_kind ON nodes(kind);

CREATE TABLE edges (
  src TEXT NOT NULL, dst TEXT NOT NULL, kind TEXT NOT NULL,
  provenance TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 1.0,
  file_path TEXT,                        -- file where the edge was observed (for invalidation)
  line INTEGER,
  data TEXT,                             -- JSON (e.g. imported names, role for member_of)
  PRIMARY KEY (src, dst, kind)
);
CREATE INDEX edges_dst ON edges(dst, kind);
CREATE INDEX edges_file ON edges(file_path);

CREATE TABLE summaries (
  node_id TEXT NOT NULL,
  language TEXT NOT NULL,                -- output language: en|tr
  kind TEXT NOT NULL,                    -- file|module|symbol
  input_hash TEXT NOT NULL,              -- hash(content + neighbour context + prompt_version + model)
  model TEXT NOT NULL,
  json TEXT NOT NULL,                    -- FileSummary | ModuleSummary
  created_at INTEGER NOT NULL,
  PRIMARY KEY (node_id, language)
);

CREATE TABLE features (
  id TEXT NOT NULL, language TEXT NOT NULL,
  json TEXT NOT NULL,                    -- Feature (members/flows inline)
  input_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (id, language)
);
-- membership is ALSO materialised as edges(kind='member_of') for graph queries

CREATE TABLE overview (language TEXT PRIMARY KEY, json TEXT NOT NULL, input_hash TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE metrics (node_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY (node_id, metric));
-- metrics: loc, complexity, complexity_max, fan_in, fan_out, fan_out_pkg, instability, exports, symbols, depth,
--          community (Louvain id), coupling:<featureId> (feature nodes only: edge count to that feature). See 11 §1.

CREATE TABLE flags (
  id TEXT PRIMARY KEY,                   -- "<rule>:<nodeId>"
  rule TEXT NOT NULL,                    -- see 11-health-analysis.md
  severity TEXT NOT NULL,                -- info|warn|high
  node_id TEXT NOT NULL,
  title TEXT NOT NULL,                   -- deterministic template text (plain English)
  explanation TEXT,                      -- optional AI-polished "why it matters" (Stretch)
  evidence TEXT NOT NULL                 -- JSON: { metrics, nodeIds, cycle?: string[] }
);

CREATE TABLE llm_cache (
  key TEXT PRIMARY KEY,                  -- sha1(provider+model+prompt_version+input)
  response TEXT NOT NULL, tokens_in INTEGER, tokens_out INTEGER, created_at INTEGER NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, finished_at INTEGER,
  status TEXT NOT NULL,                  -- running|done|error|cancelled
  stats TEXT                             -- JSON: counts, tokens, cost estimate, duration per stage
);

CREATE TABLE asks (                      -- Stretch: Ask history
  id TEXT PRIMARY KEY, question TEXT NOT NULL, answer_json TEXT, created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE search_fts USING fts5(
  node_id UNINDEXED, kind UNINDEXED,
  name, path, summary, tags, code,
  tokenize = 'porter unicode61'
);
```

**Invalidation:** when a file's hash changes, delete its `nodes`, the `edges` with `file_path = <file>`, and its FTS rows, then re-parse it. Summaries stay, but they are regenerated only when their `input_hash` changes. Features and the overview are regenerated when the set of file summary hashes changes. MVP simplification: if any summary changed, re-run feature discovery.

## 5. API DTOs (shared)

These are defined in `shared/schemas/api.ts`, and the payload of every endpoint in [08](08-api.md) is one of them. The most important ones:

```ts
const Lang = z.enum(['en', 'tr']);              // output language of AI-written text
const NodeKind = z.enum(['directory','file','symbol','route','db_model','env_var','package','service','feature']);
const EdgeKind = z.enum(['contains','imports','calls','references','renders','extends','implements','handles',
  'reads','writes','uses_env','calls_service','depends_on','member_of','feature_depends']);
const Provenance = z.enum(['ast','resolved','heuristic','inferred']);
const Severity = z.enum(['info','warn','high']);

const NodeRef = z.object({ id: z.string(), kind: NodeKind, name: z.string(), filePath: z.string().nullable(),
  startLine: z.number().nullable(), provenance: Provenance });

const NodeDTO = NodeRef.extend({                // full node
  endLine: z.number().nullable(),
  symbolKind: z.string().nullable(),
  exported: z.boolean(),
  signature: z.string().nullable(),
  confidence: z.number(),
  tier: z.number().nullable(),                  // from files.tier for file/symbol nodes
  data: z.record(z.string(), z.unknown()).nullable(),   // kind-specific (route method/path, orm, …)
  metrics: z.record(z.string(), z.number()),    // loc, complexity, fan_in, fan_out, instability…
});

const EdgeRefDTO = z.object({                   // one edge as seen from a given node
  kind: EdgeKind, provenance: Provenance, confidence: z.number(),
  node: NodeRef,                                // the OTHER end of the edge
  line: z.number().nullable(),                  // where it was observed
  filePath: z.string().nullable(),
});

const FlagDTO = z.object({
  id: z.string(), rule: z.string(), severity: Severity,
  node: NodeRef, title: z.string(), explanation: z.string().nullable(),
  evidence: z.object({ metrics: z.record(z.string(), z.number()).optional(),
    nodeIds: z.array(z.string()).optional(), cycle: z.array(z.string()).optional() }),
});

// API hydration of Feature: GET /features/:fid returns Feature with each member extended by `node: NodeRef`
const FeatureDetailDTO = Feature.extend({ members: z.array(FeatureMember.extend({ node: NodeRef })) });

const XRayDTO = z.object({                      // GET /nodes/:id
  node: NodeDTO,                                // full node incl. signature, metrics
  summary: FileSummary.or(ModuleSummary).nullable(),
  summaryMeta: z.object({ model: z.string(), createdAt: z.number() }).nullable().optional(), // selected summary, epoch ms
  symbolPurpose: z.string().nullable(),         // when node is a symbol
  features: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })),
  upstream: z.array(EdgeRefDTO),                // who depends on me (1 hop), with edge kind + provenance
  downstream: z.array(EdgeRefDTO),              // what I depend on (1 hop)
  sideEffects: z.array(SideEffect),             // deterministic (reads/writes/env/service edges) ∪ AI summary
  flags: z.array(FlagDTO),
  impactPreview: z.object({ dependants: z.number(), features: z.array(z.string()), routes: z.array(z.string()) }),
});

const ImpactDTO = z.object({                    // GET /nodes/:id/impact
  root: z.string(), direction: z.enum(['up','down','both']), depth: z.number(),
  nodes: z.array(NodeRef.extend({ distance: z.number(), direction: z.enum(['up','down']) })),
  edges: z.array(EdgeRefDTO),
  byFeature: z.array(z.object({ featureId: z.string(), count: z.number() })),
  routes: z.array(z.string()),
  truncated: z.boolean(),                       // true when maxNodes was hit (see 06 §4.5)
});

const GraphDTO = z.object({                     // GET /graph
  level: z.enum(['feature','module','file','symbol']),
  nodes: z.array(z.object({ id: z.string(), label: z.string(), kind: NodeKind, parent: z.string().nullable(),
    featureId: z.string().nullable(), size: z.number(), flags: z.number() })),
  edges: z.array(z.object({ source: z.string(), target: z.string(), kind: EdgeKind, weight: z.number(), provenance: Provenance })),
});

const AskEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thinking'), text: z.string() }),            // short status: "Searching for 'webhook'…"
  z.object({ type: z.literal('tool'), name: z.string(), args: z.unknown(), resultSummary: z.string() }),
  z.object({ type: z.literal('token'), text: z.string() }),               // streamed answer text (markdown with [[nodeId]] citations)
  z.object({ type: z.literal('done'), answer: AskAnswer }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
const AskAnswer = z.object({
  markdown: z.string(),                         // citations as [[node-id]] — UI renders them as chips
  found: z.boolean(),                           // false = "not implemented / not found"
  citations: z.array(NodeRef),
  searched: z.array(z.string()),                // what was checked (always present; essential when found=false)
});

const ProgressEvent = z.object({
  runId: z.string(),
  stage: z.enum(['scan','parse','resolve','detect','graph','health','summarize','rollup','features','overview','changeability','fts','done','error','cancelled']),
  done: z.number(), total: z.number(), message: z.string().optional(),
  tokens: z.object({ in: z.number(), out: z.number() }).optional(),
  degraded: z.boolean().optional(),             // true when >30% of a stage's LLM calls failed (06 §5.7); UI shows a banner
});
```

**Citation format:** AI-written markdown cites nodes inline as `[[file:src/lib/session.ts]]` or `[[sym:src/lib/session.ts#getCurrentUser]]`. The UI turns each one into a clickable chip showing the node's display name. The server validates citations and strips any it can't resolve.
