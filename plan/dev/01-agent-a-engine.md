# Agent A — Engine (`core` + `server`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@catalyst/core` (scan → parse → resolve → detect → graph → health → AI stages → Ask, plus the query layer) and `@catalyst/server` (the HTTP + SSE API), behind the exact interfaces frozen in [00-foundation F3](00-foundation.md#task-f3-public-interfaces-of-core-and-server-typed-stubs).

**Architecture:** A pure, stage-based pipeline writes into one SQLite DB per project ([05 §4](../docs/05-data-model.md#4-sqlite-schema-catalystcatalystdb)). A `graphology` graph is rebuilt from the DB after `detect`. All reads go through one `QueryApi` ([08 §3](../docs/08-api.md#3-query-layer-corequery)), which the HTTP routes, the Ask tools and MCP share. LLM access goes only through `core/ai/client.ts` wrapping an `LLMProvider` ([07 §2](../docs/07-llm-providers.md#2-interface-coreaiproviderstypests)).

**Tech Stack:** `better-sqlite3`, `web-tree-sitter` + `tree-sitter-wasms`, `ignore`, `graphology` + `graphology-components` + `graphology-communities-louvain`, `ai` (Vercel AI SDK) + `@ai-sdk/anthropic` + `@ai-sdk/openai-compatible` (+ `@openrouter/ai-sdk-provider`), `p-limit`, `hono` + `@hono/node-server`, `@modelcontextprotocol/sdk` (Stretch), `tsx` (scripts), Vitest.

**Spec:** [`plan/docs/`](../docs/README.md): 04, 05, 06, 07, 08, 11 and 12 are the ones this plan implements.

**Owner:** **Agent A**, on branch `engine`, after finishing [00-foundation](00-foundation.md). It touches only `packages/{core,server}`, `fixtures/repos/`, and `packages/shared` (only through `contract:` commits pushed to `main`; see [README §Git](README.md#git-workflow)).

## Global Constraints

See [README §Global constraints](README.md#global-constraints). Every task implicitly includes them.

## Milestones

| Milestone | Tasks | Delivers | Sync |
|---|---|---|---|
| **M1: Structural engine** | A1–A14 | `createEngine()` is real. `catalyst`-style indexing (no AI) of TS/JS + Python, with health, impact, find/search, behind the real HTTP API | **S1** (≈15:15) |
| **M2: AI** | A15–A19 | Summaries, rollups, features + flows, overview, changeability, Ask (SSE) | **S2** (≈16:15) |
| Stretch | A20–A24 | MCP, diff impact, Turkish, estimate, extra health rules | after S2 / in integration |

**Smoke commands**
- After A12: `node --import tsx packages/core/scripts/index-once.ts ../catalyst-testbeds/taxonomy`. This prints one line per stage (`scan 188 files …`, `parse 129/129`, `resolve 97% resolved`, `detect 14 routes · 6 models · 9 env · 4 services`, `health 3 high …`) and exits 0.
- After A14: `node --import tsx packages/server/scripts/serve.ts ../catalyst-testbeds/taxonomy`, then `curl -s 127.0.0.1:4321/api/health` → `{"ok":true,…}` and `curl -s 127.0.0.1:4321/api/projects/<pid>/find?q=session | head`.
- After A19 (optional, **costs money**): `OPENROUTER_API_KEY=… node --import tsx packages/core/scripts/index-once.ts --ai ../catalyst-testbeds/next-supabase-stripe-starter`.

## Review Focus

1. **Unparseable, huge, minified and binary files** must never fail a run. The run ends `done`, with `files.parse_error` recorded. The test is in **A12** (the `broken` fixture).
2. **Opening a nonexistent path or a `~` path** gives `PATH_NOT_FOUND` / correct expansion, never a crash or a `.catalyst/` in the wrong place. The test is in **A2**.
3. **The LLM returns unknown node IDs or malformed JSON.** IDs get dropped, JSON gets repaired once, and the item is otherwise skipped while the run continues. The test is in **A16**.
4. **Node IDs with `(group)`, `[param]`, `#` and `@` in URLs** must round-trip through Hono's path params. The test is in **A14**.
5. **Port 4321 already in use** → the server binds 4322 and reports it, so a second `catalyst` doesn't crash. The test is in **A14**.

---

### Task A1: Store (SQLite schema + repositories)

**Files:**
- Create: `packages/core/src/store/{db.ts,migrations.ts,repos.ts,index.ts}`, `packages/core/src/store/store.test.ts`

**Interfaces:**
- Consumes: the schema types from `@catalyst/shared`.
- Produces:
  ```ts
  export function openStore(dbPath: string): Store;      // creates dirs, WAL, runs migrations (schema_version=1)
  export interface Store {
    db: Database.Database;
    tx<T>(fn: () => T): T;                               // better-sqlite3 transaction wrapper
    meta: { get(k: string): string | null; set(k: string, v: string): void };
    files: { upsert(r: FileRow): void; all(): FileRow[]; get(path: string): FileRow | null; delete(path: string): void; setParsed(path: string, hash: string, err: string | null): void };
    nodes: { upsertMany(rows: NodeRow[]): void; get(id: string): NodeRow | null; byFile(path: string): NodeRow[]; byKind(kind: NodeKind): NodeRow[]; all(): NodeRow[]; deleteByFile(path: string): void; exists(id: string): boolean };
    edges: { upsertMany(rows: EdgeRow[]): void; out(src: string, kinds?: EdgeKind[]): EdgeRow[]; in(dst: string, kinds?: EdgeKind[]): EdgeRow[]; all(): EdgeRow[]; deleteByFile(path: string): void; deleteByKind(kind: EdgeKind): void };
    summaries: { get(nodeId: string, lang: Lang): SummaryRow | null; put(r: SummaryRow): void; all(lang: Lang): SummaryRow[] };
    features: { all(lang: Lang): Feature[]; put(f: Feature, lang: Lang, inputHash: string): void; clear(lang: Lang): void };
    overview: { get(lang: Lang): AppOverview | null; put(o: AppOverview, lang: Lang, inputHash: string): void };
    metrics: { set(nodeId: string, metric: string, value: number): void; get(nodeId: string): Record<string, number>; top(metric: string, n: number, kind?: NodeKind): { nodeId: string; value: number }[]; clear(): void };
    flags: { replaceAll(rows: FlagRow[]): void; all(): FlagRow[]; forNode(nodeId: string): FlagRow[] };
    llmCache: { get(key: string): string | null; put(key: string, response: string, tokensIn: number, tokensOut: number): void };
    runs: { create(id: string): void; finish(id: string, status: RunDTO['status'], stats: unknown, error?: string): void; get(id: string): RunRow | null; last(): RunRow | null };
    fts: { replaceNode(row: FtsRow): void; deleteByNode(nodeId: string): void; deleteByFile(path: string): void; search(q: string, limit: number, kind?: NodeKind): FtsHit[] };
    close(): void;
  }
  ```
  `NodeRow`/`EdgeRow`/`FileRow`/… mirror the 05 §4 columns in camelCase. `data` is a parsed object, not a string.

- [ ] **Step 1: Write the failing tests**
```ts
test('migrates and sets schema_version', () => { const s = openStore(tmp('a.db')); expect(s.meta.get('schema_version')).toBe('1'); });
test('WAL mode', () => expect(openStore(tmp('b.db')).db.pragma('journal_mode', { simple: true })).toBe('wal'));
test('nodes/edges round-trip with JSON data', () => { /* upsert file:lib/a.ts + sym:lib/a.ts#f, edge contains; expect out('file:lib/a.ts')[0].dst === 'sym:lib/a.ts#f' and data parsed */ });
test('deleteByFile removes nodes, edges and fts for that file', () => { /* … */ });
test('fts search ranks name hits and returns «» snippet', () => { /* replaceNode({nodeId:'file:app/api/webhooks/stripe/route.ts', name:'route.ts', path:'app/api/webhooks/stripe/route.ts', summary:'Handles Stripe webhook events', tags:'stripe webhook', code:''}); expect(search('stripe webhook',5)[0].nodeId).toBe('file:app/api/webhooks/stripe/route.ts'); expect(hit.snippet).toContain('«') */ });
```
- [ ] **Step 2: Run and verify they fail.** `pnpm vitest run packages/core/src/store` → FAIL (module not found)
- [ ] **Step 3: Implement `openStore`.** Copy the DDL verbatim from 05 §4. Use prepared statements, cached once per repo. `upsertMany` runs inside `tx`. For `fts.search`, use `bm25(search_fts)` and `snippet(search_fts, -1, '«', '»', '…', 12)`, and quote user terms (`"term"*`) so FTS syntax errors are impossible.
- [ ] **Step 4: Run and verify they pass.** `pnpm vitest run packages/core/src/store` → PASS
- [ ] **Step 5: Commit.** `git add packages/core && git commit -m "feat(core): sqlite store with schema v1 and repositories"`

---

### Task A2: Settings, ProjectRegistry, LocalPathSource

**Files:**
- Create: `packages/core/src/settings/{settings.ts,detect.ts}`, `packages/core/src/project/{registry.ts,source.ts,gitignore.ts,project-dir.ts}`, plus tests next to each

**Interfaces:**
- Consumes: `GlobalConfig`, `ProviderConfig`, `SettingsDTO`, `SettingsUpdate`, `ProvidersDetectDTO`, `FsBrowseDTO`, `ProjectDTO` from shared.
- Produces:
  ```ts
  export class SettingsStore { constructor(homeDir: string, env: NodeJS.ProcessEnv);
    resolved(): { config: GlobalConfig; provider: ProviderConfig | null; source: 'config' | 'env' | 'detected' | 'none' };
    get(): SettingsDTO; update(u: SettingsUpdate): SettingsDTO; }
  export function detectProviders(env: NodeJS.ProcessEnv): Promise<ProvidersDetectDTO>;
  export function maskKey(k: string): string;                // 'sk-or-v1-abcdef1234' → 'sk-or-…1234'
  export function projectId(absRoot: string): string;        // first 12 hex of sha1(absRoot)
  export function isProjectDir(path: string): boolean;       // 09 §1 marker list
  export function expandHome(p: string, homeDir: string): string;
  export function ensureGitignore(root: string): 'added' | 'present' | 'no-gitignore';
  export interface Source { kind: 'local'; root: string; listFiles(): AsyncIterable<string>; readFile(rel: string): Promise<string>; stat(rel: string): Promise<{ size: number }> }
  export class LocalPathSource implements Source { constructor(root: string) }   // never follows symlinks outside root
  export class ProjectRegistry { constructor(homeDir: string); recent(): { id: string; root: string; name: string; lastOpenedAt: number; lastIndexedAt: number | null }[]; touch(root: string): void; forget(id: string): void }
  ```
- [ ] **Step 1: Write the failing tests**
```ts
test('config written 0600', () => { s.update({ provider: { type: 'openrouter', apiKey: 'sk-or-xyz9999', baseUrl: 'https://openrouter.ai/api/v1' } }); expect(statSync(cfg).mode & 0o777).toBe(0o600); });
test('GET masks key', () => expect(s.get().provider?.apiKeyMasked).toBe('sk-or-…9999'));
test('selection order: ANTHROPIC before OPENROUTER', () => expect(new SettingsStore(home, { ANTHROPIC_API_KEY: 'a', OPENROUTER_API_KEY: 'b' }).resolved().provider?.type).toBe('anthropic'));
test('no provider → null (structural-only)', () => expect(new SettingsStore(home, {}).resolved().provider).toBeNull());  // with PATH stripped of claude
test('projectId is 12 hex and stable', () => expect(projectId('/x/taxonomy')).toMatch(/^[0-9a-f]{12}$/));
test('isProjectDir', () => { expect(isProjectDir(fixture('ts-basic'))).toBe(true); expect(isProjectDir(tmpEmpty)).toBe(false); });
test('ensureGitignore appends once', () => { expect(ensureGitignore(dir)).toBe('added'); expect(ensureGitignore(dir)).toBe('present'); expect(readFileSync(gi,'utf8')).toContain('# Catalyst local index\n.catalyst/'); });
test('no .gitignore → not created', () => { expect(ensureGitignore(dirNoGi)).toBe('no-gitignore'); expect(existsSync(join(dirNoGi,'.gitignore'))).toBe(false); });
test('expandHome', () => expect(expandHome('~/code/x', '/home/u')).toBe('/home/u/code/x'));
```
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement.** Selection order (12 §2): config `provider` → `CATALYST_PROVIDER` → `ANTHROPIC_API_KEY` → `OPENROUTER_API_KEY` → `OPENAI_API_KEY` (+ `OPENAI_BASE_URL`, default `https://api.openai.com/v1`) → `claude` on PATH → null. Default models: `{ fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' }` for anthropic; `openrouter/free` for both OpenRouter tiers; `haiku` / `sonnet` for claude-code. These go in one constant, `core/ai/defaults.ts`. `detectProviders` does `which claude` (`where` on win32) + `claude --version`, and fetches `http://localhost:11434/api/tags` with a 500 ms AbortSignal timeout. Write the config with `{ mode: 0o600 }`, then `chmodSync`.
- [ ] **Step 4: Run and verify they pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(core): settings store, provider detection, project registry, local source"` (run `git add packages/core` first)

---

### Task A3: Scanner + test fixture repos

**Files:**
- Create: `fixtures/repos/ts-basic/**`, `fixtures/repos/py-basic/**`, `fixtures/repos/broken/**` (the 2 MB and binary files are **generated in test setup** under a tmp copy, not committed)
- Create: `packages/core/src/scan/{scanner.ts,languages.ts,ignore.ts,secrets.ts}`, `packages/core/src/scan/scanner.test.ts`

**Fixture contents (they are reused by every later task, so keep them stable):**
- `ts-basic`:
  - config: `package.json` (deps `next`, `react`, `@prisma/client`, `stripe`, `next-auth`); `tsconfig.json` with `"paths": {"@/*": ["./*"]}`; `.gitignore` (`node_modules`); `.env.example` (`STRIPE_API_KEY=`, `DATABASE_URL=`); `.env` (`STRIPE_API_KEY=sk_live_FAKE_DO_NOT_READ`)
  - schema: `prisma/schema.prisma` (models `User`, `Subscription`)
  - lib: `lib/db.ts` (`export const db = new PrismaClient()`); `lib/session.ts` (`export async function getCurrentUser()` calls `getServerSession` from `next-auth`, then `db.user.findUnique`); `lib/stripe.ts` (`export const stripe = new Stripe(process.env.STRIPE_API_KEY!)`); `lib/unused.ts` (`export function neverUsed() {}`); `lib/a.ts` ↔ `lib/b.ts` (import each other)
  - app: `app/page.tsx` (renders `<Button/>`); `app/(dashboard)/billing/page.tsx` (calls `getCurrentUser`); `app/api/webhooks/stripe/route.ts` (`export async function POST`, calls `stripe.webhooks.constructEvent`, `db.subscription.update`)
  - `components/Button.tsx`
- `py-basic`:
  - `pyproject.toml` (deps `fastapi`, `sqlmodel`, `pyjwt`)
  - `app/__init__.py`, `app/main.py` (`app = FastAPI()`, `app.include_router(items.router, prefix="/items")`)
  - `app/api/__init__.py`, `app/api/routes/__init__.py`, `app/api/routes/items.py` (`router = APIRouter()`, `@router.get("/")`, `@router.post("/")` calling `crud.create_item`)
  - `app/models.py` (`class Item(SQLModel, table=True)`)
  - `app/crud.py` (`session.add(Item(...))`, `session.exec(select(Item))`)
  - `app/core/security.py` (`import jwt`, `os.getenv("SECRET_KEY")`)
- `broken`: `bad.ts` (unbalanced braces), `ok.ts`, `vendor.min.js` (one 6,000-char line).

**Interfaces:**
- Consumes: `Source`, `Store`, `ids`.
- Produces:
  ```ts
  export function languageOf(path: string): { language: string; tier: 0 | 1 | 2 | 3 };   // 06 §1.2 table
  export function isSecretFile(path: string): boolean;     // 12 §4 list; .env.example/.env.sample → false
  export interface ScanResult { files: FileRow[]; changed: string[]; deleted: string[]; envExampleNames: string[] }
  export async function scan(source: Source, store: Store, opts: { extraIgnore?: string[]; include?: string[]; maxFileBytes?: number /*1_048_576*/; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<ScanResult>;
  ```
- [ ] **Step 1: Write the failing tests**
```ts
test('ignores built-ins and .gitignore', async () => { const r = await scan(src('ts-basic'), store); expect(r.files.map(f => f.path)).not.toContain('node_modules/x/index.js'); });
test('never reads .env contents', async () => { const spy = vi.spyOn(source, 'readFile'); await scan(...); expect(spy.mock.calls.map(c => c[0])).not.toContain('.env'); });
test('.env.example names collected', async () => expect((await scan(...)).envExampleNames).toEqual(['STRIPE_API_KEY', 'DATABASE_URL']));
test('tiers', () => { expect(languageOf('a.tsx')).toEqual({ language: 'tsx', tier: 1 }); expect(languageOf('a.py').tier).toBe(1); expect(languageOf('a.go').tier).toBe(2); expect(languageOf('README.md').tier).toBe(0); });
test('large/minified/binary → tier 0 with parse_error', async () => { /* 2MB → 'too_large'; vendor.min.js → tier 0; NUL-byte file → tier 0 */ });
test('dir + file nodes with contains edges, POSIX paths', async () => { expect(store.nodes.get('dir:app/api/webhooks/stripe')).toBeTruthy(); expect(store.edges.out('dir:lib').map(e => e.dst)).toContain('file:lib/session.ts'); });
test('second scan reports no changes', async () => { await scan(...); expect((await scan(...)).changed).toEqual([]); });
test('deleted file removed', async () => { /* rm a file in tmp copy → deleted contains it; nodes gone */ });
```
- [ ] **Step 2: Run and verify they fail.**
- [ ] **Step 3: Implement** per 06 §1. Use the `ignore` package; nested `.gitignore` files are scoped to their directory. Hash with sha1; `loc` counts non-blank lines. Stream progress every 25 files.
- [ ] **Step 4: Run and verify they pass.**
- [ ] **Step 5: Commit.** `git add fixtures/repos packages/core && git commit -m "feat(core): scanner with ignore rules, tiers, secret-file exclusion + fixture repos"`

---

### Task A4: Parser infra + TS/JS adapter

**Files:**
- Create: `packages/core/src/parse/{grammars.ts,types.ts,ts-adapter.ts,complexity.ts}`, `packages/core/src/parse/queries/ts/{defs,imports,calls,jsx}.scm`, plus tests `grammars.test.ts` and `ts-adapter.test.ts`

**Interfaces:**
- Produces: `LanguageAdapter`, `ParsedFile`, `RawSymbol`, `RawImport`, `RawExport`, `RawCall`, `RawJsx`, `RawRef`, `RawDecorator`, `RawStringCall` exactly as in [06 §2.0](../docs/06-analysis-pipeline.md#20-grammar-loading), plus
  ```ts
  export async function loadGrammars(grammarsDir?: string): Promise<Grammars>;  // lazy per language; default dir = dirname(require.resolve('tree-sitter-wasms/package.json')) + '/out'
  export interface Grammars { parser(language: string): Promise<Parser | null> }
  export const tsAdapter: LanguageAdapter;   // languages: ['typescript','tsx','javascript','jsx']
  export const ADAPTER_VERSION = 1;          // part of parsed_hash
  ```
  `ParsedFile` also carries `directives: string[]` (`'use client'`/`'use server'`) and `exportedNames: string[]` (for Next.js detection, 06 §2.1).

- [ ] **Step 1: Grammar smoke test (version pinning).**
```ts
test('loads typescript, tsx, python grammars', async () => {
  const g = await loadGrammars();
  for (const l of ['typescript', 'tsx', 'python']) expect((await g.parser(l))!.parse('const a = 1').rootNode.hasError).toBe(false);
});
```
Add `web-tree-sitter` and `tree-sitter-wasms` pinned to exact versions. Run `pnpm vitest run packages/core/src/parse/grammars.test.ts`. If `Language.load` throws an ABI or version error, change `web-tree-sitter` to the version matching the tree-sitter CLI that `tree-sitter-wasms` was built with (check its package.json `devDependencies`), and repeat until it passes. **Record the working pair in `packages/core/AGENTS.md`.**
- [ ] **Step 2: Write the failing adapter tests** (inline TS snippets)
```ts
test('function/component/hook kinds', () => { const p = parseTs('export function Button(){ return <b/> }\nexport const useUser = () => 1\nfunction helper(){}', 'tsx');
  expect(p.symbols.map(s => [s.name, s.symbolKind, s.exported])).toEqual([['Button','component',true],['useUser','hook',true],['helper','function',false]]); });
test('class + method', () => expect(parseTs('export class C { m(){ this.n() } n(){} }').symbols.map(s => s.name)).toEqual(['C','m','n']));
test('imports: default, named, namespace, type-only, dynamic, require', () => { /* each RawImport flag asserted */ });
test('re-exports', () => expect(parseTs("export * from './a'\nexport { b as c } from './b'").exports).toHaveLength(2));
test('calls carry enclosing symbol', () => expect(parseTs('function f(){ g(); db.user.findMany() }').calls.map(c => [c.callerSymbol, c.calleeText])).toEqual([['f','g'],['f','db.user.findMany']]));
test('module-level call → <module>', () => expect(parseTs('init()').calls[0].callerSymbol).toBe('<module>'));
test('jsx uppercase only', () => expect(parseTs('function P(){ return <div><Button/><UI.Card/></div> }','tsx').jsx.map(j => j.element)).toEqual(['Button','UI.Card']));
test('string-arg calls', () => expect(parseTs("supabase.from('profiles').select()").strings![0]).toMatchObject({ callee: 'supabase.from', literal: 'profiles' }));
test('directives + exported names', () => { const p = parseTs("'use client'\nexport async function POST(){}"); expect(p.directives).toContain('use client'); expect(p.exportedNames).toContain('POST'); });
test('cyclomatic complexity (11 §1)', () => expect(parseTs('function f(a,b){ if(a){} for(;;){} return a && b ? 1 : 2 }').complexity.f).toBe(5));
test('signature ≤160 chars, whitespace collapsed', () => expect(parseTs('export async function getCurrentUser(\n  id: string\n): Promise<User> {}').symbols[0].signature).toBe('export async function getCurrentUser( id: string ): Promise<User>'));
test('syntax error → partial, never throws', () => expect(() => parseTs('function (((')).not.toThrow());
```
- [ ] **Step 3: Run and verify they fail.**
- [ ] **Step 4: Implement `tsAdapter.parse`.** Use the `.scm` queries for captures, plus a single tree walk to find enclosing symbols and complexity (branch node list from 11 §1, nested functions excluded). Use the `tsx` grammar for `.tsx`/`.jsx` and `typescript` for the rest.
- [ ] **Step 5: Run and verify they pass.**
- [ ] **Step 6: Commit.** `git commit -m "feat(core): web-tree-sitter grammar loading + TS/JS adapter"` (run `git add packages/core` first)

---

### Task A5: Python adapter

**Files:** Create `packages/core/src/parse/{py-adapter.ts,py-adapter.test.ts}` and `packages/core/src/parse/queries/py/*.scm`

**Interfaces:** Produces `export const pyAdapter: LanguageAdapter` (`languages: ['python']`). Its `ParsedFile` follows 06 §2.2.

- [ ] **Step 1: Write the failing tests**
```ts
test('functions, classes, methods', () => expect(parsePy('def f(): pass\nclass C(Base):\n  def m(self): self.n()').symbols.map(s => [s.name, s.symbolKind])).toEqual([['f','function'],['C','class'],['m','method']]));
test('superclasses become extends refs', () => expect(parsePy('class Item(SQLModel, table=True): pass').refs.map(r => r.name)).toContain('SQLModel'));
test('decorators captured raw', () => expect(parsePy('@router.post("/")\ndef create(): pass').decorators[0]).toMatchObject({ target: 'create', text: 'router.post("/")' }));
test('relative imports keep dots', () => expect(parsePy('from ..core import security').imports[0]).toMatchObject({ specifier: '..core', names: [{ imported: 'security', local: 'security' }] }));
test('exported = no underscore, __all__ wins', () => { expect(parsePy('def _p(): pass\ndef q(): pass').symbols.map(s => s.exported)).toEqual([false, true]); expect(parsePy('__all__=["a"]\ndef a(): pass\ndef b(): pass').symbols.find(s => s.name==='b')!.exported).toBe(false); });
test('complexity counts elif/and/comprehension-if', () => expect(parsePy('def f(a):\n  if a and b: pass\n  elif c: pass\n  return [x for x in y if x]').complexity.f).toBe(5));
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): python tree-sitter adapter"` (run `git add packages/core` first)

---

### Task A6: TS/JS module resolver

**Files:** Create `packages/core/src/resolve/{ts-resolver.ts,tsconfig.ts,workspaces.ts,ts-resolver.test.ts}`. Add `fixtures/repos/ts-alias` (a monorepo: root `pnpm-workspace.yaml`, `packages/ui` named `@acme/ui` with `exports`, `apps/web/tsconfig.json` extending `../../tsconfig.base.json` with `paths {"~/*": ["./src/*"]}`, `src/index.ts` barrel re-exports, and an ESM `.js` → `.ts` import).

**Interfaces:**
```ts
export type TsResolution = { kind: 'file'; path: string } | { kind: 'package'; name: string; builtin: boolean } | { kind: 'unresolved' };
export class TsResolver { constructor(files: Set<string>, readJson: (p: string) => unknown | null);
  resolve(fromFile: string, specifier: string): TsResolution;
  resolveBinding(fromFile: string, specifier: string, importedName: string, exportsByFile: Map<string, RawExport[]>): { file: string; name: string } | null; } // follows re-exports, depth 5, cycle-guarded
```
- [ ] **Step 1: Write the failing tests**
```ts
test('relative with extension probing + index', () => expect(r.resolve('app/page.tsx', '../components/Button')).toEqual({ kind: 'file', path: 'components/Button.tsx' }));
test('@/* alias from tsconfig paths', () => expect(r.resolve('app/(dashboard)/billing/page.tsx', '@/lib/session')).toEqual({ kind: 'file', path: 'lib/session.ts' }));
test('tsconfig extends chain', () => expect(alias.resolve('apps/web/src/a.ts', '~/b')).toEqual({ kind: 'file', path: 'apps/web/src/b.ts' }));
test('.js specifier maps to .ts', () => expect(alias.resolve('apps/web/src/a.ts', './c.js').kind).toBe('file'));
test('workspace package via exports', () => expect(alias.resolve('apps/web/src/a.ts', '@acme/ui/button')).toEqual({ kind: 'file', path: 'packages/ui/src/button.tsx' }));
test('bare → package name (scope + first segment)', () => { expect(r.resolve('a.ts', '@radix-ui/react-dialog/dist')).toEqual({ kind: 'package', name: '@radix-ui/react-dialog', builtin: false }); expect(r.resolve('a.ts', 'node:fs')).toMatchObject({ name: 'node:fs', builtin: true }); });
test('re-export binding followed to defining file', () => expect(alias.resolveBinding('apps/web/src/a.ts', './index', 'Thing', exportsMap)).toEqual({ file: 'apps/web/src/thing.ts', name: 'Thing' }));
test('missing tsconfig extends target ignored', () => { /* extends '@tsconfig/next' not on disk → no throw */ });
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** per 06 §3.1 (nearest tsconfig/jsconfig walking up, cached per dir). **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git add fixtures/repos packages/core && git commit -m "feat(core): TS/JS module resolver (paths, extends, workspaces, re-exports)"`

---

### Task A7: Python module resolver

**Files:** Create `packages/core/src/resolve/{py-resolver.ts,py-resolver.test.ts}`

**Interfaces:**
```ts
export type PyResolution = { kind: 'file'; path: string; symbol?: string } | { kind: 'package'; name: string; stdlib: boolean } | { kind: 'unresolved' };
export class PyResolver { constructor(files: Set<string>, readText: (p: string) => string | null);
  roots(): string[]; resolve(fromFile: string, specifier: string, importedName?: string): PyResolution; }
```
- [ ] **Step 1: Write the failing tests** (`py-basic`, plus a tmp copy nested under `backend/` to mirror the FastAPI template)
```ts
test('absolute app.models', () => expect(r.resolve('app/crud.py', 'app.models', 'Item')).toEqual({ kind: 'file', path: 'app/models.py', symbol: 'Item' }));
test('from package import module', () => expect(r.resolve('app/main.py', 'app.api.routes', 'items')).toEqual({ kind: 'file', path: 'app/api/routes/items.py' }));
test('relative ..core', () => expect(r.resolve('app/api/routes/items.py', '...core', 'security')).toEqual({ kind: 'file', path: 'app/core/security.py' }));
test('nested backend/ root detected', () => expect(nested.roots()).toContain('backend'));
test('alias map jwt → pyjwt', () => expect(r.resolve('app/core/security.py', 'jwt')).toEqual({ kind: 'package', name: 'pyjwt', stdlib: false }));
test('stdlib hidden', () => expect(r.resolve('a.py', 'os')).toMatchObject({ stdlib: true }));
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** per 06 §3.2 (ship a static stdlib module list in `py-stdlib.ts`). **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): python module resolver"` (run `git add packages/core` first)

---

### Task A8: Link stage (imports, calls, references, renders)

**Files:** Create `packages/core/src/resolve/{link.ts,link.test.ts}`

**Interfaces:**
```ts
export interface LinkInput { parsed: Map<string, ParsedFile>; files: FileRow[]; ts: TsResolver; py: PyResolver }
export interface LinkOutput { nodes: NodeRow[]; edges: EdgeRow[]; bindings: Map<string /*file*/, Map<string /*local*/, BindingTarget>>; unresolved: { file: string; specifier: string }[] }
export type BindingTarget = { kind: 'symbol'; id: string } | { kind: 'module'; file: string } | { kind: 'package'; id: string };
export function link(input: LinkInput): LinkOutput;   // symbol nodes + contains, imports, calls, references, renders, extends, implements
```
- [ ] **Step 1: Write the failing tests** (on the parsed `ts-basic` / `py-basic`)
```ts
test('symbol nodes use ids.sym', () => expect(out.nodes.map(n => n.id)).toContain('sym:lib/session.ts#getCurrentUser'));
test('import binding call → resolved', () => expect(edge('sym:app/(dashboard)/billing/page.tsx#default', 'sym:lib/session.ts#getCurrentUser', 'calls')).toMatchObject({ provenance: 'resolved', confidence: 1 }));
test('local call → ast', () => { /* f calls g in same file */ });
test('this.m() → #C.m ast 0.9', () => { /* … */ });
test('renders edge for <Button/>', () => expect(edge('sym:app/page.tsx#default', 'sym:components/Button.tsx#Button', 'renders')).toBeTruthy());
test('file imports edges + pkg nodes', () => { expect(edge('file:lib/session.ts', 'pkg:npm:next-auth', 'imports')).toBeTruthy(); expect(out.nodes.find(n => n.id === 'pkg:npm:next-auth')).toBeTruthy(); });
test('package-bound calls make no symbol edge', () => expect(out.edges.filter(e => e.kind === 'calls' && e.dst.startsWith('pkg:'))).toEqual([]));
test('python: crud.create_item resolved via module binding', () => expect(edge('sym:app/api/routes/items.py#create_item', 'sym:app/crud.py#create_item', 'calls')).toBeTruthy());
test('duplicate edges merged with data.count', () => { /* g() called twice → count 2 */ });
test('unique-name heuristic is heuristic 0.5', () => { /* … */ });
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** the resolution order table in 06 §3.3. Rule 6 needs a repo-wide `methodName → [classId]` index. **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): link stage — import/call/render/extends edges with provenance"` (run `git add packages/core` first)

---

### Task A9: Route detectors

**Files:** Create `packages/core/src/detect/{types.ts,routes-next.ts,routes-node.ts,routes-python.ts,routes.test.ts}`

**Interfaces:**
```ts
export interface ProjectCtx { root: string; files: FileRow[]; parsed: Map<string, ParsedFile>; bindings: LinkOutput['bindings']; deps: { npm: Set<string>; pypi: Set<string> }; readText(p: string): string | null; envExampleNames: string[] }
export interface Emitter { node(n: NodeRow): void; edge(e: EdgeRow): void; stack(entry: { name: string; category: string; evidence: string[] }): void; fileData(path: string, patch: Record<string, unknown>): void }
export interface Detector { id: string; appliesTo(ctx: ProjectCtx): boolean; run(ctx: ProjectCtx, emit: Emitter): void }
export const routeDetectors: Detector[];   // 'next-app-router','next-pages-router','next-middleware','node-http','fastapi','flask'
```
- [ ] **Step 1: Write the failing tests**
```ts
test('next app page with route group dropped', () => expect(nodes).toContainEqual(expect.objectContaining({ id: 'route:PAGE /billing', kind: 'route' })));
test('route.ts POST handler', () => expect(edge('route:POST /api/webhooks/stripe', 'sym:app/api/webhooks/stripe/route.ts#POST', 'handles')).toBeTruthy());
test('[id] kept, @slot and _private dropped', () => { /* synthetic file list */ });
test('express app.post with inline arrow → synthetic symbol', () => expect(ids).toContain('route:POST /users'));
test('fastapi include_router prefix join', () => { expect(ids).toContain('route:GET /items/'); expect(ids).toContain('route:POST /items/'); });
test('flask methods list', () => { /* @bp.route("/x", methods=["GET","POST"]) → two routes */ });
test('stack entries', () => expect(stack.map(s => s.name)).toContain('Next.js'));
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** per 06 §4.1. **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): route detectors (next, express/hono/fastify, fastapi, flask)"` (run `git add packages/core` first)

---

### Task A10: DB, env, service, test detectors + stack

**Files:** Create `packages/core/src/detect/{prisma.ts,supabase.ts,sqlalchemy.ts,env.ts,services.ts,service-map.ts,tests.ts,index.ts,data.test.ts}`

**Interfaces:**
- Produces: `export const allDetectors: Detector[]` (routes + these), and `export function runDetectors(ctx: ProjectCtx): { nodes: NodeRow[]; edges: EdgeRow[]; stack: StackEntry[]; fileData: Map<string, Record<string, unknown>> }`. The `SERVICE_MAP` and `HOST_MAP` tables in `service-map.ts` come from 06 §4.4.
- [ ] **Step 1: Write the failing tests**
```ts
test('prisma schema models', () => expect(node('db:prisma:User').data.fields.map((f: any) => f.name)).toContain('email'));
test('prisma read/write ops', () => { expect(edge('sym:lib/session.ts#getCurrentUser', 'db:prisma:User', 'reads')).toBeTruthy(); expect(edge('sym:app/api/webhooks/stripe/route.ts#POST', 'db:prisma:Subscription', 'writes')).toBeTruthy(); });
test('supabase from().insert → writes', () => { /* synthetic snippet → db:supabase:profiles writes */ });
test('sqlmodel table=True + session.add/exec', () => { expect(node('db:sqlalchemy:Item')).toBeTruthy(); expect(edge('sym:app/crud.py#create_item', 'db:sqlalchemy:Item', 'writes')).toBeTruthy(); });
test('env vars TS + Python + .env.example', () => { expect(edge('file:lib/stripe.ts', 'env:STRIPE_API_KEY', 'uses_env')).toBeTruthy(); expect(node('env:SECRET_KEY').data.category).toBe('secret'); expect(node('env:DATABASE_URL').data.declaredIn).toBe('.env.example'); });
test('services: pkg depends_on svc and calls_service from symbol', () => { expect(edge('pkg:npm:stripe', 'svc:stripe', 'depends_on')).toBeTruthy(); expect(edge('sym:app/api/webhooks/stripe/route.ts#POST', 'svc:stripe', 'calls_service')).toBeTruthy(); });
test('fetch host matching', () => { /* fetch("https://api.github.com/x") → svc:github */ });
test('test files flagged', () => expect(fileData.get('tests/a.test.ts')?.isTest).toBe(true));
test('stack contains Prisma, Stripe, NextAuth with evidence ids', () => { /* … */ });
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** per 06 §4.2–4.4. **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): db/env/service/test detectors + deterministic stack"` (run `git add packages/core` first)

---

### Task A11: Graph, metrics, MVP health rules, impact BFS, pathsBetween

**Files:** Create `packages/core/src/graph/{build.ts,impact.ts,paths.ts,communities.ts}`, `packages/core/src/analyze/{metrics.ts,thresholds.ts,rules/{cycle,god-file,god-function,hub,unused-export}.ts,health.ts}`, plus tests `graph.test.ts` and `health.test.ts`

**Interfaces:**
```ts
export function buildGraph(store: Store): MultiDirectedGraph;            // from nodes+edges
export function computeMetrics(g: MultiDirectedGraph, store: Store, parsed: Map<string, ParsedFile>): void; // 11 §1 → metrics rows incl. complexity_max, fan_out_pkg, depth, community
export function runHealth(g: MultiDirectedGraph, store: Store, thresholds: Thresholds): FlagRow[];  // MVP rules only; id `<rule>:<nodeId>`
export const RULE_WHY: Record<string, string>;                           // static "why this matters" per rule (11 §5)
export function impact(g: MultiDirectedGraph, rootId: string, opts: { direction: 'up' | 'down' | 'both'; depth?: number /*3*/; maxNodes?: number /*300*/; edgeKinds?: EdgeKind[]; includeTests?: boolean; includeTypeOnly?: boolean }): ImpactDTO;  // featureIds via member_of
export function pathsBetween(g: MultiDirectedGraph, from: string, to: string, opts?: { maxDepth?: number /*4*/; maxPaths?: number /*3*/ }): string[][];
export const DEFAULT_THRESHOLDS: Thresholds;  // 11 §3 values
```
- [ ] **Step 1: Write the failing tests** (`ts-basic`, indexed via A1–A10)
```ts
test('cycle flag for lib/a.ts ↔ lib/b.ts', () => expect(flags.find(f => f.rule === 'cycle')!.evidence.cycle).toEqual(['file:lib/a.ts', 'file:lib/b.ts', 'file:lib/a.ts']));
test('cycle severity warn for size 2 non-route', () => expect(flags.find(f => f.rule === 'cycle')!.severity).toBe('warn'));
test('unused-export flags neverUsed but not POST/page default', () => { expect(ids('unused-export')).toContain('unused-export:sym:lib/unused.ts#neverUsed'); expect(ids('unused-export').some(i => i.includes('route.ts#POST') || i.endsWith('page.tsx#default'))).toBe(false); });
test('god-function on synthetic complexity 26 → high', () => { /* … */ });
test('hub uses max(minFanIn, P95)', () => { /* synthetic graph 12 importers → info */ });
test('title templates are plain English', () => expect(cycleFlag.title).toMatch(/import each other in a loop/));
test('impact up from getCurrentUser reaches billing page + route', () => { const r = impact(g, 'sym:lib/session.ts#getCurrentUser', { direction: 'up' }); expect(r.routes).toContain('route:PAGE /billing'); expect(r.truncated).toBe(false); });
test('impact maxNodes truncates', () => expect(impact(g, 'file:lib/db.ts', { direction: 'up', maxNodes: 2 }).truncated).toBe(true));
test('impact down includes db + svc leaves', () => expect(impact(g, 'sym:app/api/webhooks/stripe/route.ts#POST', { direction: 'down' }).nodes.map(n => n.id)).toEqual(expect.arrayContaining(['db:prisma:Subscription', 'svc:stripe'])));
test('pathsBetween route → db', () => expect(pathsBetween(g, 'route:POST /api/webhooks/stripe', 'db:prisma:Subscription').length).toBeGreaterThan(0));
test('metrics: instability and fan_in', () => expect(store.metrics.get('file:lib/db.ts').fan_in).toBeGreaterThanOrEqual(2));
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** per 06 §4.5 and 11 §1–2. Seed Louvain with a fixed RNG (`rng: seededRandom(42)`). **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): graph build, metrics, MVP health rules, impact BFS, paths"` (run `git add packages/core` first)

---

### Task A12: IndexRun orchestration (structural stages) + smoke script

**Files:** Create `packages/core/src/jobs/{index-run.ts,events.ts,index-run.test.ts}` and `packages/core/scripts/index-once.ts`

**Interfaces:**
- Consumes: A1–A11.
- Produces: `export function startIndexRun(ctx: { store: Store; source: Source; grammars: Grammars; settings: SettingsStore; projectConfig: ProjectConfig; logger: Logger }, req: IndexRequest): IndexRun`, implementing the F3 `IndexRun`. Stages in order: `scan → parse → resolve → detect → graph → health → [AI stages, registered by A16–A18 via `registerAiStages()`] → fts → done`. `export function loadProjectConfig(root: string): ProjectConfig` reads `catalyst.config.json` (12 §3). The `fts` stage indexes name/path/code (the first 2 KB of each symbol body) plus any existing summaries/tags.
- [ ] **Step 1: Write the failing tests**
```ts
test('full structural run on ts-basic emits stages in order and ends done', async () => { const run = startIndexRun(ctx, { ai: false }); const stages = []; for await (const { event } of run.events()) stages.push(event.stage);
  expect(dedupe(stages)).toEqual(['scan','parse','resolve','detect','graph','health','fts','done']); expect((await run.done).status).toBe('done'); });
test('second run parses nothing', async () => { await (startIndexRun(ctx, { ai: false })).done; const r = await startIndexRun(ctx, { ai: false }).done; expect(r.stats!.stageMs).toBeDefined(); expect(parseCount(r)).toBe(0); });
test('broken fixture: run done, parse_error recorded', async () => { const r = await startIndexRun(brokenCtx, { ai: false }).done; expect(r.status).toBe('done'); expect(brokenStore.files.get('bad.ts')!.parseError).toBeTruthy(); });
test('event ids increase and replay from sinceId', async () => { /* events(5) yields ids > 5 only */ });
test('cancel → cancelled', async () => { const run = startIndexRun(bigCtx, { ai: false }); run.cancel(); expect((await run.done).status).toBe('cancelled'); });
test('edited file → only that file re-parsed; its old nodes removed', async () => { /* … */ });
test('progress at least every 25 items', async () => { /* parse events count ≥ ceil(files/25) */ });
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement.** Use an EventEmitter plus a ring buffer (500 entries, increasing `id`). Each stage is wrapped so that per-item errors go into `runs.stats.errors[]`, and only infrastructure errors set `error`. Throttle progress to ≥ 250 ms or 25 items. Write `meta.last_index_at`, `meta.ai_status = 'skipped'` when `ai: false` or there's no provider, and `meta.stack_json`. `index-once.ts` parses argv (`<path>`, `--ai`) and prints one line per stage transition.
- [ ] **Step 4: Run → PASS**, then run the smoke command on `../catalyst-testbeds/taxonomy` (see Milestones). Expected: exit 0, and the `resolve` line shows ≥ 90% resolved.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): index run orchestration with progress, cancel, incremental re-parse"` (run `git add packages/core` first)

---

### Task A13: Query layer (structural) + the real `createEngine`

**Files:** Create `packages/core/src/query/{query.ts,find.ts,tree.ts,xray.ts,graph-view.ts,query.test.ts}`, `packages/core/src/project/project.ts`. Modify `packages/core/src/engine.ts` (replace the stubs).

**Interfaces:**
- Produces: `export function createQueryApi(ctx: { store: Store; graph: () => MultiDirectedGraph; source: Source; project: () => ProjectDTO }): QueryApi`, implementing **every** 08 §3 method. The AI-dependent fields return empty/null until A18: `getOverview` → `{ overview: null, … }`, `listFeatures` → `[]`, XRay `summary: null`. `getFeature` throws `NODE_NOT_FOUND`. `diffImpact` throws `NOT_IMPLEMENTED` (A21). `createEngine(opts)` now returns a working Engine. `Project.ask` throws `AI_NOT_CONFIGURED` until A19.
- Pinned behaviour:
  - `find`: in-memory subsequence scorer over node names and paths. Exact prefix > word-boundary > subsequence, shorter names win ties, returns `matchRanges`, built lazily and refreshed after each run.
  - `graph`: `level=file` → file nodes + aggregated edges (weight = count) with `parent` = the dir id; `level=feature` → feature nodes + `feature_depends`. Node cap is `limit` (default 400), taking the highest-degree nodes first and setting `truncated`. With `focus`, take the BFS `depth` neighbourhood instead.
  - `getSource`: reads through `Source` and refuses secret files (`isSecretFile` → `BAD_REQUEST`). Default range is the node's range (`file:` → the whole file). Max 2,000 lines. `outline` comes from the file's symbols.
  - `getXRay.sideEffects`: built deterministically from outbound `reads`/`writes`/`uses_env`/`calls_service`, merged with the summary's side effects when present. `impactPreview` comes from `impact(up, depth 3)`.
- [ ] **Step 1: Write the failing tests** (engine over `ts-basic` in a tmp home)
```ts
test('engine.projects.open + index + list', async () => { const p = await engine.projects.open(fx('ts-basic')); await p.index({ ai: false }).done; expect(engine.projects.list()[0]).toMatchObject({ id: p.id, status: 'ready', aiStatus: 'skipped' }); });
test('xray deterministic', () => { const x = p.query.getXRay('sym:lib/session.ts#getCurrentUser', 'en'); expect(x.summary).toBeNull(); expect(x.upstream.map(e => e.node.id)).toContain('sym:app/(dashboard)/billing/page.tsx#default'); expect(x.sideEffects.map(s => s.kind)).toContain('db_read'); XRayDTO.parse(x); });
test('find getcu → getCurrentUser first with ranges', () => { const r = p.query.find('getcu'); expect(r[0].node.id).toBe('sym:lib/session.ts#getCurrentUser'); expect(r[0].matchRanges[0]).toEqual([0, 5]); });
test('search stripe webhook top 3 contains route file', () => expect(p.query.search('stripe webhook').slice(0, 3).map(r => r.node.id)).toContain('file:app/api/webhooks/stripe/route.ts'));
test('tree nests dirs, files have tier', () => TreeNodeDTO.parse(p.query.getTree()));
test('graph file level validates + respects limit', () => { const g = p.query.graph({ level: 'file', limit: 3 }); expect(g.nodes).toHaveLength(3); expect(g.truncated).toBe(true); });
test('getSource refuses .env', async () => await expect(p.query.getSource('file:.env')).rejects.toMatchObject({ code: expect.stringMatching(/BAD_REQUEST|NODE_NOT_FOUND/) }));
test('every query result parses with its shared schema', () => { HealthDTO.parse(p.query.getHealth()); ProjectDTO.parse(p.query.getProject()); OverviewDTO.parse(p.query.getOverview('en')); });
test('unknown node → NODE_NOT_FOUND', () => expect(() => p.query.getNode('file:nope.ts')).toThrowError(expect.objectContaining({ code: 'NODE_NOT_FOUND' })));
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): structural query layer + real createEngine"` (run `git add packages/core` first)

---

### Task A14: Server (Hono HTTP + SSE + static) — Milestone M1

**Files:** Create `packages/server/src/{app.ts,errors.ts,token.ts,sse.ts,static.ts,routes/{global,projects,index-runs,read,search,health}.ts,start.ts}`, `packages/server/src/app.test.ts`, `packages/server/scripts/serve.ts`. Modify `packages/server/src/index.ts`.

**Interfaces:**
- Consumes: `Engine` (A13) and the shared schemas.
- Produces: `createApp(engine, { token, staticDir })` and `startServer(engine, opts)`, exactly as in F3. Every MVP row of 08 §2 is implemented. Ask (`POST /ask`) is added in A19, and `/estimate` + `/impact/diff` in Stretch.
- Pinned behaviour:
  - Errors: `CatalystError` → status per 08 §1 + `ErrorBody`; Zod failure → 400 `BAD_REQUEST` with `details`; anything else → 500 `INTERNAL` (the message is redacted of anything key-shaped).
  - Token: non-GET requests and `/api/settings*` require `X-Catalyst-Token`, else 401 `UNAUTHORIZED`.
  - Every `/api/projects/:pid/*` response carries `X-Catalyst-Index: <lastRunId>`.
  - SSE (`hono/streaming` `streamSSE`): `event:` = `progress` | `done` | `error`, `id:` = the event id, honours `Last-Event-ID`, `: ping` every 15 s.
  - Static: serve `staticDir`; for any non-`/api` GET that has no matching file, return `index.html` with `<meta name="catalyst-token" content="…">` injected before `</head>`. If `staticDir` is unset, return a plain-text "UI not built" page.
  - `startServer`: tries `port … port+portRange` on `EADDRINUSE`, and binds `host` (default `127.0.0.1`).
- [ ] **Step 1: Write the failing tests**
```ts
test('GET /api/health', async () => expect(await (await app.request('/api/health')).json()).toMatchObject({ ok: true, mock: false }));
test('POST without token → 401', async () => expect((await app.request('/api/projects', { method: 'POST', body: '{}' })).status).toBe(401));
test('open + index + poll run', async () => { /* POST /api/projects {path} → ProjectDTO; POST /index → 202 {runId}; GET /runs/:rid until done */ });
test('encoded route-group node id → 200', async () => { const id = encodeURIComponent('sym:app/(dashboard)/billing/page.tsx#default'); expect((await app.request(`/api/projects/${pid}/nodes/${id}`)).status).toBe(200); });
test('unknown pid → 404 PROJECT_NOT_FOUND body', async () => expect(await (await app.request('/api/projects/000000000000/overview')).json()).toEqual({ error: { code: 'PROJECT_NOT_FOUND', message: expect.any(String) } }));
test('SSE stream ends with event: done', async () => { const text = await (await app.request(`/api/projects/${pid}/runs/${rid}/events`)).text(); expect(text).toMatch(/event: done/); });
test('X-Catalyst-Index header present', async () => expect((await app.request(`/api/projects/${pid}/tree`)).headers.get('x-catalyst-index')).toBe(rid));
test('SPA fallback injects token meta', async () => expect(await (await app.request('/p/x/overview')).text()).toContain('<meta name="catalyst-token" content="t0k"'));
test('settings GET needs token and masks key', async () => { /* … apiKeyMasked */ });
test('port in use → next port', async () => { const a = await startServer(engine, { port: 4999 }); const b = await startServer(engine, { port: 4999 }); expect(b.port).toBe(5000); await a.close(); await b.close(); });
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: Run → PASS**, then run the A14 smoke command (see Milestones).
- [ ] **Step 5: Commit.** `git commit -m "feat(server): hono API, SSE runs, token auth, static UI with token injection"` (run `git add packages/server` first)
- [ ] **Step 6: Sync S1.** Follow [README §Git](README.md#git-workflow): merge `engine` → `main`, push, and tell Agent B that "M1 is on main". The whole suite must be green first.

---

### Task A15: LLM layer (providers, client, FakeProvider)

**Files:** Create `packages/core/src/ai/{defaults.ts,client.ts,redact.ts,pricing.ts}`, `packages/core/src/ai/providers/{types.ts,ai-sdk.ts,claude-code.ts,fake.ts,factory.ts}`, plus tests `client.test.ts`, `claude-code.test.ts` and `redact.test.ts`

**Interfaces:**
- Produces the `LLMProvider`, `ModelTier`, `LLMUsage` and `StreamPart` types exactly as in 07 §2, plus:
  ```ts
  export function createProvider(cfg: ProviderConfig, models: { fast: string; smart: string }): LLMProvider;   // openrouter | anthropic | openai-compatible (AI SDK) | claude-code
  export class FakeProvider implements LLMProvider { constructor(script: { objects?: Record<string /*schemaName*/, unknown[] | ((prompt: string) => unknown)>; texts?: string[]; streams?: StreamPart[][]; failTimes?: number; supportsTools?: boolean }); calls: { schemaName?: string; prompt: string }[] }
  export class LLMClient { constructor(p: LLMProvider, store: Store, opts: { concurrency: number; budgetUsd: number | null; signal?: AbortSignal; promptVersion: Record<string, number> });
    object<T>(stage: string, req: { tier: ModelTier; schema: z.ZodType<T>; schemaName: string; system: string; prompt: string }): Promise<T>;  // cache → pool → retry → repair (07 §8) → usage
    stream(req: Parameters<LLMProvider['streamText']>[0]): AsyncIterable<StreamPart>;
    usage(): { tokensIn: number; tokensOut: number; calls: number; cacheHits: number; costUsd: number | null };
    budgetExceeded(): boolean; }
  export function redactSecrets(code: string): string;   // 12 §5 patterns → «redacted»
  ```
- [ ] **Step 1: Write the failing tests**
```ts
test('cache hit skips provider', async () => { await client.object('summarize', req); await client.object('summarize', req); expect(fake.calls).toHaveLength(1); expect(client.usage().cacheHits).toBe(1); });
test('retries 429 with backoff then succeeds', async () => { /* FakeProvider failTimes:2 with 429 error → resolves, calls 3 */ });
test('repairs invalid JSON once, then throws', async () => { /* objects: ['{bad', valid] → valid; ['{bad','{bad'] → rejects */ });
test('budget: stops when cost exceeds cap', async () => { /* budgetUsd 0.0001 → budgetExceeded() true, next call rejects BUDGET */ });
test('abort signal cancels pending', async () => { /* … */ });
test('concurrency limit respected', async () => { /* max in-flight ≤ 2 */ });
test('redacts keys', () => { expect(redactSecrets('const k = "sk_live_abc123abc123abc123"')).toContain('«redacted»'); expect(redactSecrets('-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----')).not.toContain('PRIVATE KEY-----\nx'); });
test('claude-code adapter: prompt via stdin, parses result JSON, 1 retry', async () => { /* write tmp script `claude` that echoes '{"result":"```json\\n{\\"a\\":1}\\n```"}' and put its dir first on PATH → object {a:1}; supportsTools false */ });
test('factory picks adapter by type', () => expect(createProvider({ type: 'claude-code', binary: 'claude' }, m).supportsTools).toBe(false));
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** per 07 §2–§5, §7–§8. The shared system preamble goes in `core/ai/prompts/shared.ts` (07 §7). Wire `engine.settings.test()` to `provider.test()`. Pass the OpenRouter headers `HTTP-Referer: https://github.com/kmab5/catalyst` and `X-Title: Catalyst`, and nothing user-identifying.
- [ ] **Step 4: Run → PASS.** Optional manual check (costs money): `OPENROUTER_API_KEY=… node --import tsx packages/core/scripts/index-once.ts --ai ../catalyst-testbeds/next-supabase-stripe-starter`. This only becomes meaningful after A16.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): LLM providers (AI SDK + claude-code), client with cache/pool/retry/budget, FakeProvider"` (run `git add packages/core` first)

---

### Task A16: Summarize + rollup stages

**Files:** Create `packages/core/src/ai/{context.ts,stages/summarize.ts,stages/rollup.ts,stages/register.ts,prompts/summarize.ts,prompts/rollup.ts}`, plus tests `summarize.test.ts` and `rollup.test.ts`

**Interfaces:**
- Produces: `export const PROMPT_VERSION = { summarize: 1, rollup: 1, features: 1, overview: 1, changeability: 1, ask: 1 }`, plus `export function registerAiStages(): AiStage[]`, which A12's run picks up when `req.ai !== false` and a provider resolves. `export function assembleFileContext(file: string, store: Store, g: MultiDirectedGraph, budget: { source: 6000; facts: 600; down: 1200; up: 800 }): { prompt: string; allowedIds: string[]; inputHash: string }`.
- Pinned behaviour: tokens ≈ `chars / 3.5`. Order: reverse topological on `imports` (leaves first; SCCs batched). Deterministic summaries (no LLM) for tests, barrels and files under 3 LOC (06 §5.1). `input_hash` as in 06 §6.1. Prose goes in `outputLanguage`.
- [ ] **Step 1: Write the failing tests** (FakeProvider)
```ts
test('summarises every analysed non-test file once', async () => { /* index ts-basic with fake → summaries.all('en').length === analysed - tests - tiny */ });
test('leaves before importers', () => expect(order.indexOf('file:lib/db.ts')).toBeLessThan(order.indexOf('file:lib/session.ts')));
test('allowedIds include symbols + neighbours + detector targets', () => expect(ctx.allowedIds).toEqual(expect.arrayContaining(['sym:lib/session.ts#getCurrentUser', 'file:lib/db.ts', 'db:prisma:User'])));
test('bogus ids dropped, deterministic side effects merged', async () => { /* fake returns symbols:[{nodeId:'sym:nope#x'}], sideEffects:[] → saved summary has no 'sym:nope#x' and has db_read for db:prisma:User */ });
test('malformed JSON twice → no summary, run still done, error recorded', async () => { /* … */ });
test('re-run unchanged → 0 LLM calls', async () => { /* fake.calls.length unchanged */ });
test('leaf purpose change re-summarises importers; unchanged purpose does not', async () => { /* … */ });
test('rollup bottom-up for dirs with ≥2 analysed descendants', async () => { /* dir:lib gets ModuleSummary */ });
test('secrets redacted in prompt', async () => expect(fake.calls.some(c => c.prompt.includes('sk_live_'))).toBe(false));
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** with the prompt skeletons from 06 §5.2–5.3. **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): file summaries + module rollups grounded on graph context"` (run `git add packages/core` first)

---

### Task A17: Features + overview stages

**Files:** Create `packages/core/src/ai/stages/{features.ts,features-post.ts,overview.ts}` and `packages/core/src/ai/prompts/{features.ts,features-merge.ts,overview.ts}`, plus tests `features.test.ts` and `overview.test.ts`

**Interfaces:**
- Produces: `export function postProcessFeatures(raw: unknown[], store: Store, g: MultiDirectedGraph): Feature[]`, a pure deterministic function implementing steps 1–5 of 06 §5.4 (so it is testable without an LLM). `export function deterministicFeatures(store: Store): Feature[]` is the Louvain fallback (`confidence: 0.3`). `export function gapSignals(store: Store): string[]` implements 06 §5.5.
- [ ] **Step 1: Write the failing tests**
```ts
test('ids validated, slug deduped', () => expect(postProcessFeatures([{ name: 'Billing', members: [{ nodeId: 'file:nope.ts', role: 'core' }, { nodeId: 'file:lib/stripe.ts', role: 'core' }] , …}, { name: 'Billing', … }], store, g).map(f => f.id)).toEqual(['feature:billing', 'feature:billing-2']));
test('coverage pass: unassigned → neighbour vote, else feature:shared', () => expect(features.find(f => f.id === 'feature:shared')!.members.length).toBeGreaterThan(0));
test('flow edgeVerified via graph path', () => expect(flow.steps.map(s => s.edgeVerified)).toEqual([true, true]));   // route:POST /api/webhooks/stripe → route.ts#POST → db:prisma:Subscription
test('<50% verified → confidence halved', () => { /* … */ });
test('derives services, dataModels, dependsOn (≥2 edges, not shared)', () => expect(billing.services).toContain('svc:stripe'));
test('member_of edges (node → feature) materialised with provenance inferred', () => expect(store.edges.out('file:lib/stripe.ts', ['member_of'])[0]).toMatchObject({ dst: 'feature:billing', provenance: 'inferred' }));
test('features LLM fails → deterministic fallback', async () => { /* fake throws → features exist with confidence 0.3 */ });
test('large repo uses map/reduce (>400 files)', async () => { /* synthetic 450-file index → fake.calls include schemaName 'FeaturesMerge' */ });
test('overview stack filtered to deterministic entries', async () => { /* fake returns stack incl. 'Kubernetes' → dropped */ });
test('gap signal: no tests', () => expect(gapSignals(store)).toContain('no-tests'));
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** with the 06 §5.4–5.5 prompts. **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): feature discovery with flow verification + app overview"` (run `git add packages/core` first)

---

### Task A18: Changeability stage + AI parts of the query layer

**Files:** Create `packages/core/src/ai/stages/changeability.ts`, `packages/core/src/analyze/changeability-facts.ts`, `packages/core/src/ai/prompts/changeability.ts`, plus test `changeability.test.ts`. Modify `packages/core/src/query/{query.ts,xray.ts}` and `packages/core/src/jobs/index-run.ts` (the fts stage now includes summaries/tags).

**Interfaces:**
- Produces: `export function changeabilityFacts(featureId: string, store: Store, g: MultiDirectedGraph): ChangeabilityFacts` (the 11 §4.2 table), `export function suggestLevels(f: ChangeabilityFacts): { add: Ease; change: Ease; remove: Ease }` (11 §4.2 pre-grading), and `export function fallbackCard(f: ChangeabilityFacts, feature: Feature): Changeability`. Query: `getOverview` returns the stored `AppOverview` + `stack` + `features` + `entryPoints` + `health`. `listFeatures` returns `FeatureListItemDTO[]` with `colorIndex` = the index in features sorted by id, mod 8, and `feature:shared` last. `getFeature` returns `FeatureDetailDTO` (hydrated). `getXRay` fills `summary`, `symbolPurpose` and `features`.
- [ ] **Step 1: Write the failing tests**
```ts
test('suggestLevels remove easy when outside blast ≤5 and no shared written model', () => expect(suggestLevels({ ...facts, outsideImpact: 3, sharedWrittenModels: [] }).remove).toBe('easy'));
test('model moving a level by 2 is clamped with (adjusted)', async () => { /* fake returns removeEase hard when suggested easy → moderate + reason endsWith '(adjusted)' */ });
test('couplings overwritten with deterministic counts', async () => { /* … */ });
test('citesMetrics mismatches dropped', async () => { /* … */ });
test('no AI → fallback card from template', () => expect(fallbackCard(facts, billing).summary).toMatch(/Removing Billing would affect \d+ files outside it/));
test('listFeatures colorIndex stable + shared last', () => { const l = p.query.listFeatures('en'); expect(l.at(-1)!.id).toBe('feature:shared'); expect(l.map(f => f.colorIndex)).toEqual(sortedIdx); });
test('xray includes summary + features after AI run', () => { const x = p.query.getXRay('file:lib/stripe.ts', 'en'); expect(x.summary).not.toBeNull(); expect(x.features[0].id).toBe('feature:billing'); });
test('search finds by AI tag', () => expect(p.query.search('payments').map(r => r.node.id)).toContain('file:lib/stripe.ts'));
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** per 11 §4. **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): changeability cards + AI-backed overview/features/xray queries"` (run `git add packages/core` first)

---

### Task A19: Ask agent + `POST /ask` SSE — Milestone M2

**Files:** Create `packages/core/src/ai/ask/{tools.ts,agent.ts,single-shot.ts,citations.ts}`, `packages/core/src/ai/prompts/ask.ts`, plus test `ask.test.ts`. Modify `packages/core/src/project/project.ts` (`ask`) and `packages/server/src/routes/search.ts` (`POST /ask`).

**Interfaces:**
- Produces: `Project.ask(req, signal): AsyncIterable<AskEvent>` (F3), `export function askTools(q: QueryApi): Record<string, ToolDef>` (the 06 §7.1 tools, each capped at about 2k tokens with `truncated`), and `export function validateCitations(markdown: string, exists: (id: string) => boolean): { markdown: string; citations: string[] }`.
- Pinned behaviour: `smart` tier, `maxSteps: 8`, 90 s timeout. Not-found protocol: if the trailing JSON says `found: false` with fewer than 3 distinct `search`/`find` queries, inject one corrective user message and continue (06 §7.2). When `supportsTools = false`, use the single-shot fallback (06 §7.3). `searched` is always filled. The server streams with `event:` = the `AskEvent.type`.
- [ ] **Step 1: Write the failing tests** (FakeProvider streams)
```ts
test('tool call → tool event, tokens, done with citations', async () => { /* stream: tool-call search{query:'stripe webhook'} → text 'Handled in [[file:app/api/webhooks/stripe/route.ts]]\n{"found":true,"searched":["stripe webhook"]}' */
  expect(types).toEqual(['thinking','tool','token','done']); expect(done.answer.citations[0].id).toBe('file:app/api/webhooks/stripe/route.ts'); });
test('unknown citation stripped to plain text', () => expect(validateCitations('see [[file:nope.ts]]', () => false).markdown).toBe('see nope.ts'));
test('found:false with 1 search → corrective message injected', async () => { /* fake.calls second messages contains 'Search more' */ });
test('found:false after 3 searches accepted, searched lists them', async () => expect(done.answer).toMatchObject({ found: false, searched: expect.arrayContaining(['password reset', 'forgot password', 'reset token']) }));
test('single-shot fallback when supportsTools=false', async () => { /* fake supportsTools:false → schemaName 'AskExpansion' call then one smart text call; done emitted */ });
test('no provider → AI_NOT_CONFIGURED', async () => await expect(first(noAiProject.ask({ question: 'x' }))).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' }));
test('server POST /ask streams event: done', async () => { /* app.request with token → text includes 'event: done' */ });
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core,server): Ask agent with tools, not-found protocol, single-shot fallback, SSE"` (run `git add packages/core packages/server` first)
- [ ] **Step 6: Sync S2.** Merge `engine` → `main` (all green) and announce "M2 is on main".

---

## Stretch (after S2, in this order; may be finished in [03](03-integration-and-testing.md))

### Task A20: MCP server
**Files:** `packages/server/src/mcp.ts` (+ `mcp.test.ts`). **Produces:** `export async function startMcp(engine: Engine, path: string): Promise<void>`. It uses stdio via `@modelcontextprotocol/sdk` with the server name `catalyst`, the instructions string, and the 10 tools from 08 §4. Their input schemas are Zod → JSON schema. It runs a structural-only index first if the project is `never-indexed`, and logs only to stderr.
- [ ] Test: an in-memory client transport calls `get_blast_radius({ id: 'sym:lib/session.ts#getCurrentUser' })` → the JSON text parses as `ImpactDTO`; `tools/list` returns 10 tools. → Implement → PASS → `git commit -m "feat(server): MCP stdio server"`

### Task A21: Diff impact
**Files:** `packages/core/src/query/diff.ts` (+ test). Modify `packages/server/src/routes/health.ts`. `query.diffImpact({ base })` runs `git diff --unified=0 [base...HEAD] + worktree` → maps hunks to symbol ranges → upstream impact at depth 3 → `DiffImpactDTO`. `POST /impact/diff` adds the `smart` narrative when AI is available.
- [ ] Test: in a tmp git copy of `ts-basic`, edit `lib/session.ts` → `changedNodes` contains `sym:lib/session.ts#getCurrentUser` and `affected.routes` contains `route:PAGE /billing`. → `git commit -m "feat(core): diff impact"`

### Task A22: Turkish output (`outputLanguage: tr`)
- [ ] Test: with `language: 'tr'`, FakeProvider receives prompts containing `Write all prose in Turkish`, summaries are stored with `language='tr'` alongside `en`, and `?lang=tr` returns them. → `git commit -m "feat(core): output language tr"`

### Task A23: `POST /estimate`
- [ ] Test: on `ts-basic` the result parses as `EstimateDTO`, with `filesNeedingSummary` = the uncached count and `costUsd` null for claude-code (07 §5.1 formula). → `git commit -m "feat(core,server): cost estimate"`

### Task A24: Stretch health rules
- [ ] For each of `single-impl-interface`, `pass-through-wrapper`, `cross-feature-coupling`, `deep-relative-import` and `missing-auth-on-mutating-route` (11 §2): one positive and one negative fixture test, each rule in its own file under `analyze/rules/`, then commit `feat(core): health rule <id>`.
