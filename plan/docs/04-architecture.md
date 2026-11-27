# 04 — Architecture

## 1. Runtime topology

```
                         ┌────────────────────────────────────────────┐
   terminal              │  catalyst (Node process, packages/cli)      │
   $ catalyst ──────────▶│                                             │
                         │  ┌──────────────┐     ┌──────────────────┐  │
   browser               │  │ server (Hono)│────▶│ core: Engine     │  │
   http://localhost:4321 │  │  /api/*  SSE │     │  ProjectRegistry │  │
   ◀────────────────────▶│  │  /*  static  │     │  Project × N     │  │
                         │  └──────────────┘     │   ├ Store (SQLite)│ │
   AI agent (Stretch)    │  ┌──────────────┐     │   ├ Indexer      │  │
   stdio ───────────────▶│  │ MCP server   │────▶│   ├ Analyzer     │  │
                         │  └──────────────┘     │   ├ AI pipeline  │  │
                         │                        │   └ Query/Ask    │  │
                         │                        └────────┬─────────┘  │
                         └─────────────────────────────────┼────────────┘
                                                           │ HTTPS (only to the configured provider)
                                                           ▼
                                  OpenRouter / Anthropic / OpenAI-compatible / Ollama / `claude -p`
```

- **There is one Node process.** `catalyst` starts the Hono server, which serves the built web UI (static files) and `/api/*`. The engine runs in the same process. Heavy parsing can move to `worker_threads` later; the MVP runs on the main thread with yields between files.
- **Projects are first-class.** A single server can have several projects open. Each project's state lives in `<projectRoot>/.catalyst/catalyst.db`. Global state (provider config, recent projects) lives in `~/.catalyst/`.
- **MCP** (Stretch) is a separate entry point (`catalyst mcp`) that runs over stdio, opens the same project DB read-mostly, and reuses the `core` query layer.

## 2. Monorepo layout

pnpm workspaces, TypeScript everywhere, ESM, Node ≥ 22.

```
catalyst/
├─ package.json              # workspace root, scripts: dev, build, test, lint
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ packages/
│  ├─ shared/                # @catalyst/shared — THE CONTRACT
│  │  └─ src/
│  │     ├─ ids.ts           # node ID builders/parsers
│  │     ├─ schemas/         # Zod: nodes, edges, summaries, features, flags, api DTOs, events, config
│  │     └─ index.ts
│  ├─ core/                  # @catalyst/core — the engine (no HTTP)
│  │  └─ src/
│  │     ├─ engine.ts        # Engine facade: openProject, index, query, ask
│  │     ├─ project/         # ProjectRegistry, Project, Source (LocalPathSource)
│  │     ├─ scan/            # file walker, ignore rules, language detection, hashing
│  │     ├─ parse/           # tree-sitter loader + language adapters (ts, python, tier2, tier3)
│  │     ├─ resolve/         # import resolvers (ts, python), call resolver
│  │     ├─ detect/          # framework detectors (routes, db, env, services, components)
│  │     ├─ graph/           # graphology build, SCC, louvain, BFS impact
│  │     ├─ analyze/         # metrics + health rules
│  │     ├─ ai/              # providers, prompts, stages (summarize, rollup, features, overview, changeability), ask agent
│  │     ├─ store/           # SQLite (better-sqlite3), migrations, repositories, FTS
│  │     ├─ query/           # read API used by server + MCP + ask tools
│  │     └─ jobs/            # IndexRun orchestration, progress events, cancellation
│  ├─ server/                # @catalyst/server — Hono HTTP + SSE routes, MCP server
│  ├─ web/                   # @catalyst/web — React + Vite UI (built to static)
│  └─ cli/                   # catalyst-dx (published) — commander, bin "catalyst"; bundles server + web dist
├─ fixtures/
│  ├─ index/taxonomy.json    # FIXTURE INDEX: realistic API payloads for UI dev without the engine
│  └─ repos/                 # small hand-made repos for unit tests (ts-basic, py-basic, ts-alias, cycles)
└─ plan/                     # docs + dev plan
```

### Package dependency rules

```
shared  ◀── core ◀── server ◀── cli
   ▲                            │
   └──────── web ◀──────────────┘ (cli bundles web's static build)
```

- `shared` depends only on `zod`.
- `web` depends only on `shared` (types and schemas). It **never** imports `core`.
- `core` never imports `server`, `web` or `cli`.
- `server` is thin: it validates input with shared schemas, calls `core`, and serialises the result.
- `cli` wires everything together and is the only published package (`catalyst-dx`). It bundles `server`, `core` and the `web` dist (via tsup), so users install a single package.

## 3. Core modules (responsibilities and interfaces)

### 3.1 Engine facade (`core/engine.ts`)

The only entry point `server`, `cli` and MCP use.

```ts
interface Engine {
  projects: ProjectRegistry;                       // list/open/forget projects, recent list
  openProject(source: SourceSpec): Promise<Project>;
  settings: SettingsStore;                          // ~/.catalyst/config.json
}

interface Project {
  id: string;                    // stable hash of the absolute root path (first 12 hex of sha1)
  root: string;
  status(): ProjectStatus;       // never-indexed | indexing | ready | stale | error
  index(opts: IndexOptions): IndexRun;          // returns a run handle; emits ProgressEvent
  query: QueryApi;                               // read-only graph/summaries/search
  ask(question: string, opts?: AskOptions): AsyncIterable<AskEvent>;
  impact(spec: ImpactSpec): Promise<ImpactResult>;   // Stretch (diff)
}
```

### 3.2 Source abstraction (`core/project/source.ts`)

```ts
interface Source {
  kind: 'local' | 'git';           // 'git' is Later (hosted)
  root: string;                    // local filesystem root that the scanner reads
  listFiles(): AsyncIterable<string>;   // repo-relative POSIX paths
  readFile(rel: string): Promise<string>;
  diff?(base?: string): Promise<ChangedFile[]>;  // Stretch: git diff for impact
}
```

The MVP has only `LocalPathSource`. `GitRepoSource` (clones to a temp dir) is the seam for the hosted version later.

### 3.3 Indexing pipeline (`core/jobs/index-run.ts`)

Stages run in order. Each stage is idempotent and cache-aware. See [06](06-analysis-pipeline.md).

```
scan → parse → resolve → detect → graph → metrics/health → [AI] summarize → rollup → features → overview → changeability → fts
```

- An `IndexRun` emits `ProgressEvent { stage, done, total, message }` over an EventEmitter, and the server forwards these over SSE.
- The run can be cancelled (via an AbortController) and resumed: completed work is in the DB, and the cache skips it.
- If no AI provider is configured, the AI stages are skipped and `project.meta.aiStatus = 'skipped'`.

### 3.4 Store (`core/store`)

`better-sqlite3`, WAL mode, one DB per project. The schema is in [05](05-data-model.md). Repositories (`NodesRepo`, `EdgesRepo`, `SummariesRepo`, …) are the only code that writes SQL.

### 3.5 Query layer (`core/query`)

This is shared by HTTP, MCP and the Ask agent's tools, which is why the three surfaces always agree. The functions are listed in [08 §3](08-api.md).

### 3.6 AI layer (`core/ai`)

- `providers/`: an `LLMProvider` interface plus adapters (see [07](07-llm-providers.md)).
- `prompts/`: one file per stage, versioned (`PROMPT_VERSION`), since the version is part of the cache key.
- `stages/`: summarize, rollup, features, overview, changeability, and tier3-extract (Stretch).
- `ask/`: the agent loop and its tool definitions, which wrap `query`.

## 4. Key technology choices

| Concern | Choice | ADR |
|---|---|---|
| Language/runtime | TypeScript, Node ≥ 22, ESM, pnpm workspaces | [0001](decisions/0001-typescript-monorepo.md) |
| Parsing | `web-tree-sitter` (WASM) + grammar `.wasm` files shipped in the package | [0002](decisions/0002-web-tree-sitter.md) |
| Storage | SQLite via `better-sqlite3` (prebuilt binaries, FTS5 included) | [0003](decisions/0003-sqlite-better-sqlite3.md) |
| Graph algorithms | `graphology` + `graphology-communities-louvain` + `graphology-components` (SCC) | — |
| AI role | Core, but always grounded in the deterministic graph | [0004](decisions/0004-ai-core-grounded.md) |
| LLM access | Vercel AI SDK (`ai`) + `@ai-sdk/anthropic` + `@ai-sdk/openai-compatible`/OpenRouter + our own Claude Code CLI adapter | [0005](decisions/0005-llm-providers.md) |
| Validation | Zod (shared between server, web and LLM structured output) | — |
| HTTP | Hono + `@hono/node-server`, SSE via `hono/streaming` | — |
| CLI | `commander`, `open` (launches the browser), `picocolors` | — |
| MCP | `@modelcontextprotocol/sdk` (stdio) | — |
| UI | React 19 + Vite + Tailwind + shadcn/ui + TanStack Query + React Router | — |
| Graph viz | Cytoscape.js + `cytoscape-fcose` (main graph); React Flow + ELK for flow diagrams (Stretch) | [0006](decisions/0006-cytoscape.md) |
| Code view | Shiki for syntax highlighting (read-only; no Monaco in the MVP) | — |
| Search | SQLite FTS5; fuzzy find in memory (a simple trigram/subsequence scorer) | [0008](decisions/0008-fts-over-embeddings.md) |
| Build | `tsup` (packages), Vite (web); `vitest` (tests) | — |
| API shape | Project-scoped REST + SSE; Source abstraction | [0009](decisions/0009-project-scoped-api.md) |

## 5. Ownership & parallel work

Two people, each driving coding agents, working on separate machines.

| Owner | Packages | Delivers |
|---|---|---|
| **Dev A, "Engine"** | `core`, `server` (+ MCP) | Indexing pipeline, AI stages, query layer, HTTP/SSE implementation |
| **Dev B, "Experience"** | `web`, `cli` | All UI screens, the launcher, settings, the CLI commands and packaging |
| **Shared, agreed first** | `shared`, `fixtures/index/taxonomy.json` | The Zod schemas and API DTOs, plus a realistic fixture of every API response |

**The contract-first rule.** `packages/shared` and the fixture index are written together in the first ~30 minutes, before anything else. After that:

- Dev B builds the UI against a **mock API** (a Vite dev middleware in `packages/web/mock/`) that serves `fixtures/index/taxonomy.json` through the real route shapes (`pnpm --filter @catalyst/web dev:mock`).
- Dev A builds the engine and checks its output by validating real responses against the same Zod schemas. A contract test asserts that the real `/api/projects/:pid/overview` parses with `OverviewDTO`.
- Any change to `shared` is announced to the other dev and committed alone, as a dedicated commit with the `contract:` prefix.

Each package gets an `AGENTS.md` that states its boundary: what it owns, what it must not import, and which shared schemas it implements or consumes. This keeps each person's coding agents inside their lane.

## 6. Cross-cutting concerns

- **Paths:** always repo-relative POSIX (`src/lib/auth.ts`), even on Windows. Convert at the `Source` boundary.
- **Errors:** `core` throws typed `CatalystError { code, message, details }`. The server maps these to HTTP status codes plus `{ error: { code, message } }`.
- **Logging:** `pino`-style levels, sent to stderr. `CATALYST_LOG=debug`. Code content and secrets are never logged.
- **Performance targets:** parsing at least 200 files/s on a laptop; a 500-file repo's structural index in under 15 s; UI API responses under 100 ms for anything except Ask.
- **Concurrency:** LLM calls go through a p-limit pool (default 6, configurable). SQLite writes are batched inside transactions.
