# Phase 0 — Foundation & Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the monorepo, the complete `@catalyst/shared` contract (IDs + every Zod schema), and the typed `core`/`server` public interfaces as stubs, so Agent A and Agent B can work in parallel without waiting on each other.

**Architecture:** pnpm workspace with `packages/{shared,core,server,cli}` created here (`web` is created by Agent B in parallel, see [02 B0](02-agent-b-experience.md)). `shared` holds only Zod schemas and ID helpers. `core` and `server` export their final public signatures, and each function body throws `NOT_IMPLEMENTED` until Agent A fills it in.

**Tech Stack:** Node ≥ 22, pnpm ≥ 9, TypeScript 5.x (strict, ESM, `moduleResolution: "Bundler"`), Zod 3.x, Vitest 2.x, tsup 8.x.

**Spec:** [`plan/docs/`](../docs/README.md), especially [04-architecture](../docs/04-architecture.md), [05-data-model](../docs/05-data-model.md), [08-api](../docs/08-api.md) and [12-config-and-privacy](../docs/12-config-and-privacy.md).

**Owner:** **Agent A** runs this phase on machine A, then pushes to `main` and tags `contract-v1`. Agent B runs [B0](02-agent-b-experience.md#task-b0-web-package-scaffold-app-shell-design-tokens) at the same time; B0 doesn't need this phase.

## Global Constraints

See [README §Global constraints](README.md#global-constraints). Every task here implicitly includes them.

## Review Focus

- **Node IDs with route-group/dynamic-segment characters** (`sym:app/(dashboard)/editor/[postId]/page.tsx#default`) must round-trip through `ids.parse(ids.build(...))` and through `encodeURIComponent`. That test is in F2.
- **Windows-style paths** given to `ids.file()` must be normalised to POSIX (`src\\lib\\a.ts` → `src/lib/a.ts`). That test is in F2.
- **Duplicate symbol names in one file** get the `@<line>` suffix. That test is in F2.
- **Schemas accept the realistic payload shapes from 05/08.** Each DTO gets a "parses a sample" test in F2, so neither agent discovers a schema bug in the other's code.
- **Lockfile conflicts** between the two agents' branches: the rule is documented in the README and checked in F1 (`pnpm install --frozen-lockfile` works on a fresh clone).

---

### Task F1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.workspace.ts`, `.nvmrc`, `.npmrc`, `AGENTS.md`, `CLAUDE.md` (one line: `See AGENTS.md`)
- Create: `packages/{shared,core,server,cli}/package.json`, `packages/*/tsconfig.json`, `packages/*/src/index.ts`, `packages/*/AGENTS.md`
- Create: `fixtures/repos/.gitkeep`, `fixtures/index/.gitkeep`
- Modify: `.gitignore` (keep the existing `.env` line)

**Interfaces:**
- Produces: workspace package names `@catalyst/shared`, `@catalyst/core`, `@catalyst/server`, `catalyst-dx` (dir `packages/cli`, bin `catalyst`), and later `@catalyst/web` (made by B). Root scripts are `build`, `dev`, `test`, `typecheck` and `lint`. Packages reference each other with `"workspace:*"`.

- [ ] **Step 1: Install the toolchain on the machine** (Node isn't installed in the WSL env yet)

Run: `curl -fsSL https://fnm.vercel.app/install | bash && source ~/.bashrc && fnm install 22 && fnm use 22 && corepack enable && corepack prepare pnpm@9 --activate`
Expected: `node -v` → `v22.x`, `pnpm -v` → `9.x`

- [ ] **Step 2: Write the root files**

`package.json`: `"private": true`, `"type": "module"`, `"engines": { "node": ">=22" }`, `"packageManager": "pnpm@9.x"`, and scripts `"build": "pnpm -r --filter ./packages/** build"`, `"test": "vitest run"`, `"typecheck": "pnpm -r typecheck"`. devDeps: `typescript`, `vitest`, `tsup`, `@types/node`.
`pnpm-workspace.yaml`: `packages: ["packages/*"]`.
`tsconfig.base.json`: `strict`, `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `resolveJsonModule`, `skipLibCheck`, `declaration`, `noUncheckedIndexedAccess`.
`vitest.workspace.ts`: `['packages/*']`.
`.gitignore`: add `node_modules/`, `dist/`, `.catalyst/`, `*.tsbuildinfo`, `.DS_Store`, `../catalyst-testbeds` (a note only; testbeds live outside the repo).

- [ ] **Step 3: Create the package skeletons**

Each package gets `"type": "module"`, `"main": "./dist/index.js"`, `"types": "./src/index.ts"` (source types, so no build is needed between workspace packages during dev), `"exports": { ".": { "types": "./src/index.ts", "import": "./dist/index.js" } }`, plus the scripts `build: tsup src/index.ts --format esm --dts`, `typecheck: tsc --noEmit` and `test: vitest run`. Dependencies follow the rules in [04 §2](../docs/04-architecture.md#package-dependency-rules): `shared` depends on `zod` only; `core` → `shared`; `server` → `core`, `shared`; `cli` → `server`, `core`, `shared`.

- [ ] **Step 4: Write the `AGENTS.md` files**

Root `AGENTS.md`: what Catalyst is (2 lines), a link to `plan/docs/README.md` and `plan/dev/README.md`, the package ownership table (A: shared*, core, server; B: web, cli; *shared changes are `contract:` commits only), commands (`pnpm test`, `pnpm typecheck`), and the Global constraints from the dev README copied verbatim.
Each package's `AGENTS.md`: its owner, what it may import, what it must never import, and which docs sections it implements.

- [ ] **Step 5: Add a smoke test and run everything**

Create `packages/shared/src/smoke.test.ts` containing `expect(1).toBe(1)`.
Run: `pnpm install && pnpm typecheck && pnpm test`
Expected: install succeeds; typecheck shows 0 errors; `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold pnpm monorepo (shared, core, server, cli)"
```

---

### Task F2: `@catalyst/shared` — IDs and every Zod schema

**Files:**
- Create: `packages/shared/src/ids.ts`, `packages/shared/src/ids.test.ts`
- Create: `packages/shared/src/schemas/{graph,summary,changeability,feature,overview,config,events,api}.ts`
- Create: `packages/shared/src/schemas/schemas.test.ts`, `packages/shared/src/samples.ts` (one valid sample object per DTO, exported for both agents' tests)
- Modify: `packages/shared/src/index.ts` (re-export everything)

**Interfaces:**
- Produces (`ids.ts`):
  ```ts
  export const ids: {
    dir(path: string): string;                 // 'dir:src/lib'   ('' → 'dir:' root)
    file(path: string): string;                // 'file:src/lib/a.ts' (normalises '\\' → '/', strips leading './')
    sym(path: string, name: string, opts?: { className?: string; line?: number }): string; // 'sym:a.ts#C.m' / '#name@42'
    route(method: string, path: string): string;   // 'route:POST /api/x', method upper-cased; 'PAGE' | 'LAYOUT' | 'MIDDLEWARE' | 'ANY' allowed
    db(orm: string, model: string): string;        // 'db:prisma:User'
    env(name: string): string;                     // 'env:STRIPE_API_KEY'
    pkg(ecosystem: 'npm' | 'pypi' | 'go', name: string): string; // 'pkg:npm:next-auth'
    svc(name: string): string;                     // 'svc:stripe'
    feature(slug: string): string;                 // 'feature:billing' (slugifies)
    parse(id: string): { kind: NodeKind; path?: string; name?: string; className?: string; line?: number; method?: string; orm?: string; ecosystem?: string; raw: string };
    kindOf(id: string): NodeKind;
  };
  export function slugify(name: string): string;   // 'Billing & Subscriptions' → 'billing-subscriptions'
  export function toPosixRel(root: string, abs: string): string;
  ```
- Produces (schemas): **exactly** the names in [05 §1–§5](../docs/05-data-model.md) and [08 §2.1](../docs/08-api.md#21-additional-dtos): `NodeKind, EdgeKind, Provenance, Severity, Lang, SymbolKind, NodeRef, NodeDTO, EdgeRefDTO, FlagDTO, SideEffect, FileSummary, ModuleSummary, Ease, Changeability, FeatureMember, FlowStep, Flow, Feature, FeatureDetailDTO, AppOverview, XRayDTO, ImpactDTO, GraphDTO, AskEvent, AskAnswer, ProgressEvent, ProjectStatus, ProjectDTO, RunDTO, OverviewDTO, FeatureListItemDTO, TreeNodeDTO, SourceDTO, FindResultDTO, SearchResultDTO, HealthDTO, ProviderType, ProviderConfig, GlobalConfig, SettingsDTO, SettingsUpdate, EstimateDTO, DiffImpactDTO, ErrorBody`. Every schema also exports its inferred type under the same name (`export type NodeRef = z.infer<typeof NodeRef>`).
- Also produces these request/inline DTOs, which 08 shows only inline in tables:
  ```ts
  IndexRequest   = { mode?: 'incremental'|'full' (default 'incremental'), ai?: boolean (default true), budgetUsd?: number, language?: Lang }
  AskRequest     = { question: string (min 1), lang?: Lang, history?: { role: 'user'|'assistant'; content: string }[] }
  GraphQuery     = { level: 'feature'|'module'|'file'|'symbol' (default 'file'), focus?: string, depth?: number (default 2), feature?: string, edgeKinds?: EdgeKind[], nodeKinds?: NodeKind[], provenance?: Provenance[], limit?: number (default 400) }
  GraphResponse  = GraphDTO.extend({ truncated: boolean, totalNodes: number })
  FsBrowseDTO    = { path, parent: string|null, entries: { name, path, isProject: boolean, hasIndex: boolean }[] }
  ProvidersDetectDTO = { claudeCli: { found, version? }, ollama: { found, models: string[] }, env: { OPENROUTER_API_KEY: boolean, ANTHROPIC_API_KEY: boolean, OPENAI_API_KEY: boolean } }
  TestProviderResult = { ok: boolean, model: string, latencyMs: number, message?: string }
  HealthResponse = { ok: true, version: string, mock: boolean }
  ```
- `ErrorBody = { error: { code: ErrorCode, message: string, details?: unknown } }`, where `ErrorCode` is the enum of the codes in [08 §1](../docs/08-api.md#error-codes) plus `NOT_IMPLEMENTED`.

- [ ] **Step 1: Write the failing ID tests**

```ts
test('file ids normalise windows paths', () => expect(ids.file('src\\lib\\a.ts')).toBe('file:src/lib/a.ts'));
test('method ids', () => expect(ids.sym('a.ts', 'm', { className: 'C' })).toBe('sym:a.ts#C.m'));
test('duplicate names get line suffix', () => expect(ids.sym('a.ts', 'handler', { line: 42 })).toBe('sym:a.ts#handler@42'));
test('route-group paths round-trip', () => {
  const id = ids.sym('app/(dashboard)/editor/[postId]/page.tsx', 'default');
  expect(ids.parse(decodeURIComponent(encodeURIComponent(id)))).toMatchObject({ kind: 'symbol', path: 'app/(dashboard)/editor/[postId]/page.tsx', name: 'default' });
});
test('route ids', () => expect(ids.route('post', '/api/webhooks/stripe')).toBe('route:POST /api/webhooks/stripe'));
test('kindOf', () => expect(['dir:x','file:x','sym:x#y','route:GET /','db:prisma:U','env:X','pkg:npm:a','svc:s','feature:f'].map(ids.kindOf))
  .toEqual(['directory','file','symbol','route','db_model','env_var','package','service','feature']));
test('slugify', () => expect(slugify('Billing & Subscriptions')).toBe('billing-subscriptions'));
test('toPosixRel', () => expect(toPosixRel('/r', '/r/src/a.ts')).toBe('src/a.ts'));
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm vitest run packages/shared/src/ids.test.ts`
Expected: FAIL (`ids` is not exported)

- [ ] **Step 3: Implement `ids.ts`**

`parse` splits on the first `:`. For `sym:`, it splits path/name on the **last** `#` (paths may not contain `#`, while names can't contain `/`). The `@<digits>` suffix becomes `line`, and `Class.method` is split on the first `.` of the name part.

- [ ] **Step 4: Write the schemas, copied from 05/08, plus `samples.ts`**

Copy the Zod code from 05 §2–§5, 08 §2.1, 11 §4.1 (`Changeability`) and 12 §2 (`ProviderConfig`, `GlobalConfig`). Where a doc uses `z.lazy` for forward references, order the declarations so that it isn't needed, except for `TreeNodeDTO`, which is recursive. `samples.ts` exports one realistic valid object per schema, named `sample<Name>` (e.g. `sampleXRayDTO`), with values from the taxonomy repo (`file:lib/session.ts`, `feature:billing`, `route:POST /api/webhooks/stripe`).

- [ ] **Step 5: Write the schema tests**

```ts
for (const [name, schema] of Object.entries(allSchemas)) {
  test(`${name} parses its sample`, () => expect(() => schema.parse((samples as any)[`sample${name}`])).not.toThrow());
}
test('AskEvent rejects unknown type', () => expect(AskEvent.safeParse({ type: 'nope' }).success).toBe(false));
test('ProgressEvent accepts cancelled + degraded', () =>
  expect(ProgressEvent.parse({ runId: 'r', stage: 'cancelled', done: 0, total: 0, degraded: true }).stage).toBe('cancelled'));
test('ProviderConfig claude-code defaults binary', () => expect(ProviderConfig.parse({ type: 'claude-code' })).toEqual({ type: 'claude-code', binary: 'claude' }));
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pnpm vitest run packages/shared && pnpm --filter @catalyst/shared typecheck`
Expected: all pass; 0 type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared && git commit -m "contract: shared ids + zod schemas + samples (05/08/11/12)"
```

---

### Task F3: Public interfaces of `core` and `server` (typed stubs)

**Files:**
- Create: `packages/core/src/engine.ts`, `packages/core/src/errors.ts`, `packages/core/src/query/types.ts`
- Create: `packages/server/src/index.ts` (stub exports)
- Create: `packages/core/src/engine.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces (final; Agent A implements them, Agent B consumes them from the CLI):**

```ts
// core/src/errors.ts
export class CatalystError extends Error { constructor(public code: ErrorCode, message: string, public details?: unknown); }

// core/src/query/types.ts — exactly 08 §3 QueryApi (copy the signatures verbatim)
export interface QueryApi { /* getProject … diffImpact, as in 08 §3 */ }

// core/src/engine.ts
export interface EngineOptions {
  homeDir?: string;        // default os.homedir(); config at <homeDir>/.catalyst/
  grammarsDir?: string;    // default: resolved from the 'tree-sitter-wasms' package; the CLI passes <cli>/dist/grammars
  logger?: Logger;         // { debug, info, warn, error }(msg, obj?) → stderr
  env?: NodeJS.ProcessEnv; // default process.env (tests inject)
}
export interface Engine {
  projects: {
    list(): ProjectDTO[];
    open(path: string): Promise<Project>;          // abs or '~'-relative; throws PATH_NOT_FOUND; creates .catalyst/, updates .gitignore (09 §4)
    get(pid: string): Project | undefined;
    forget(pid: string, opts?: { purge?: boolean }): Promise<void>;
  };
  settings: {
    get(): SettingsDTO;                              // keys masked
    update(u: SettingsUpdate): SettingsDTO;
    test(provider?: ProviderConfig): Promise<TestProviderResult>;
    detect(): Promise<ProvidersDetectDTO>;
  };
  isProjectDir(path: string): boolean;               // 09 §1 marker list
  browse(path?: string): FsBrowseDTO;
  close(): Promise<void>;
}
export interface Project {
  readonly id: string; readonly root: string; readonly name: string;
  info(): ProjectDTO;
  index(req?: IndexRequest): IndexRun;               // throws INDEX_RUNNING
  activeRun(): IndexRun | null;
  getRun(runId: string): RunDTO | null;
  query: QueryApi;
  ask(req: AskRequest, signal?: AbortSignal): AsyncIterable<AskEvent>;  // throws AI_NOT_CONFIGURED
}
export interface IndexRun {
  readonly id: string;
  events(sinceId?: number): AsyncIterable<{ id: number; event: ProgressEvent }>; // replays the buffer (last 500), then live; ends after done/error/cancelled
  readonly done: Promise<RunDTO>;
  cancel(): void;
}
export function createEngine(opts?: EngineOptions): Engine;   // stub: methods throw CatalystError('NOT_IMPLEMENTED')

// server/src/index.ts
export interface ServerOptions { port?: number /*4321*/; host?: string /*'127.0.0.1'*/; staticDir?: string; token?: string /*random 32-byte hex*/; portRange?: number /*20*/ }
export function createApp(engine: Engine, opts: { token: string; staticDir?: string }): Hono;
export function startServer(engine: Engine, opts?: ServerOptions): Promise<{ url: string; port: number; token: string; close(): Promise<void> }>;
```

- [ ] **Step 1: Write the failing test**

```ts
test('createEngine returns an object implementing Engine whose methods throw NOT_IMPLEMENTED', async () => {
  const e = createEngine({ homeDir: tmpdir() });
  expect(() => e.projects.list()).toThrowError(expect.objectContaining({ code: 'NOT_IMPLEMENTED' }));
});
```

- [ ] **Step 2: Run it and verify it fails** — `pnpm vitest run packages/core/src/engine.test.ts` → FAIL (module not found)

- [ ] **Step 3: Write the interfaces and stubs.** The stubs throw `new CatalystError('NOT_IMPLEMENTED', '<method>')`. Add `hono` and `@hono/node-server` to `server`, and make `createApp`/`startServer` throw the same way.

- [ ] **Step 4: Run the tests** — `pnpm test && pnpm typecheck` → all pass

- [ ] **Step 5: Commit, push and tag**

```bash
git add -A && git commit -m "contract: core Engine/Project/IndexRun/QueryApi + server start interfaces (stubs)"
git push origin main && git tag contract-v1 && git push origin contract-v1
```

Then tell Agent B "contract-v1 is pushed". B continues from [B1](02-agent-b-experience.md).
