# Agent B — Experience (web + cli) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every MVP screen of the Catalyst web UI against a mock API driven by a realistic fixture, and build the `catalyst` CLI plus its packaging. Both must then work unchanged against Agent A's real engine at integration.

**Architecture:** `packages/web` is a React SPA that talks to the engine **only** through the typed API client (`src/api/client.ts`) and the [08](../docs/08-api.md) routes. A Vite dev middleware (`packages/web/mock/`) answers those same routes from `fixtures/index/taxonomy.json`, and the same handler function backs the tests through a fetch stub. `packages/cli` is a thin commander shell over the `Engine` interface and `startServer` from [00-foundation F3](00-foundation.md#task-f3-public-interfaces-of-core-and-server-typed-stubs). Its tests use a `FakeEngine`, so nothing here waits on Agent A.

**Tech Stack:** React 19, Vite 6, TypeScript 5 (strict), Tailwind CSS v4, shadcn/ui, React Router 7, TanStack Query 5, lucide-react, `@fontsource/inter` + `@fontsource/jetbrains-mono`, Shiki, Cytoscape.js + `cytoscape-fcose`, `cmdk`, `react-markdown`, `eventsource-parser`, Vitest + @testing-library/react + jsdom. CLI: commander, picocolors, open, tsup.

**Spec:** [10-web-ui](../docs/10-web-ui.md), [09-cli](../docs/09-cli.md), [08-api](../docs/08-api.md), [05-data-model §5](../docs/05-data-model.md#5-api-dtos-shared), [02 §Demo script](../docs/02-users-and-use-cases.md#demo-script-hackathon-4-minutes).

**Owner:** **Agent B**, machine B, branch `experience`. Touch only `packages/web`, `packages/cli` and `fixtures/index/`.

## Global Constraints

All of [README §Global constraints](README.md#global-constraints) applies. In addition: `web` imports **only** `@catalyst/shared` (types + schemas), never `core`/`server`. All UI strings go through `t()`. Node IDs in URLs are always `encodeURIComponent`-encoded. Use the frontend-design skill for visual decisions and follow [10 §1](../docs/10-web-ui.md#1-design-direction): no gradient hero, no stat-tile grid, no emoji icons.

## Review Focus

- **Node IDs containing `(group)`, `[param]`, `#`, `@` and spaces** must survive the client URL, the router query (`?node=`) and back. Tests are in B2 (`encodes route-group node ids`) and B8 (`deep link selects node with route-group id`).
- **The server goes away mid-session** (Ctrl+C on the CLI): the app must show the "Catalyst isn't running" banner and retry, not a blank screen. Tests are in B2 (`network failure raises SERVER_GONE`) and B11 (`server-gone banner appears and clears`).
- **No-AI projects** (`aiStatus: 'skipped'`, `overview: null`, Ask → `412 AI_NOT_CONFIGURED`) must still render the deterministic content plus `NoAIBanner`. Tests are in B6 (`no-AI overview shows stack and banner`) and B10 (`ask without AI shows NoAIBanner`).
- **A graph over the node cap** (`truncated: true`) shows the "too many nodes — pick a feature" fallback instead of freezing the tab. The test is in B9 (`truncated graph shows fallback`).
- **The CLI run outside a project, on a missing path, or on a busy port** should open the launcher, exit 3, and print the real port respectively. Tests are in B12 (`non-project cwd opens launcher`, `missing path exits 3`, `prints port returned by startServer`).

---

### Task B0: Web package scaffold, app shell, design tokens

Runs **before** `contract-v1` and doesn't use `@catalyst/shared`.

**Files:**
- Create: `packages/web/{package.json,vite.config.ts,tsconfig.json,index.html,components.json,AGENTS.md}`
- Create: `packages/web/src/{main.tsx,App.tsx,routes.tsx}`, `src/styles/{tokens.css,globals.css}`, `src/i18n/{en.ts,tr.ts,t.ts}`, `src/shell/{AppShell.tsx,LeftNav.tsx,TopBar.tsx}`, `src/pages/*.tsx` (placeholders), `src/test/setup.ts`
- Test: `packages/web/src/shell/AppShell.test.tsx`

**Interfaces:**
- Produces: `t(key: keyof typeof en, vars?: Record<string, string | number>): string`; `<AppShell>` with an `<Outlet/>`; `routes` (the React Router route objects for the [10 §5 route table](../docs/10-web-ui.md#routes)); CSS tokens `--bg, --surface, --surface-2, --text, --text-muted, --border, --accent`, `--feature-0` … `--feature-7`, `--blast-up` (amber), `--blast-down` (teal), `--sev-high` (red), `--sev-warn` (amber), `--sev-info` (slate), all redefined under `@media (prefers-color-scheme: dark)` and `[data-theme=dark]`.
- `package.json` name `@catalyst/web`; scripts `dev`, `dev:mock` (`vite --mode mock`), `build`, `test`, `typecheck`.

- [ ] **Step 1: Set up the machine.** Install Node 22 + pnpm with the [F1 step 1](00-foundation.md#task-f1-monorepo-scaffold) commands, then clone the testbeds ([test-repos.md](../docs/test-repos.md)) into `../catalyst-testbeds/`. Create the branch: `git checkout -b experience`.

- [ ] **Step 2: Scaffold** with `pnpm create vite packages/web --template react-ts`. Add Tailwind v4 (`@tailwindcss/vite`), run `pnpm dlx shadcn@latest init`, and add `react-router`, `@tanstack/react-query`, `lucide-react`, `@fontsource/inter` and `@fontsource/jetbrains-mono`, plus the devDeps `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event` and `@testing-library/jest-dom`. Until `contract-v1` is merged, run commands with `pnpm --dir packages/web …`. **Don't commit** `packages/web/pnpm-lock.yaml`; delete it once the workspace exists.

- [ ] **Step 3: Write the failing test**

```tsx
test('shell renders nav items and search trigger', () => {
  renderAt('/p/abc123/overview');                       // MemoryRouter + routes
  for (const k of ['Overview','Features','Explorer','Graph','Health','Ask']) expect(screen.getByRole('link', { name: k })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /search or ask anything/i })).toBeInTheDocument();
});
test('t() interpolates', () => expect(t('health.count', { n: 3 })).toBe('3 issues'));
```

- [ ] **Step 4: Run it** — `pnpm --dir packages/web vitest run` → FAIL

- [ ] **Step 5: Implement** the tokens (10 §1 colours), fonts (Inter for UI/prose, JetBrains Mono for code/paths/IDs only), the AppShell matching the [10 §2 wireframe](../docs/10-web-ui.md#2-app-shell) (left nav, top bar with project-switcher placeholder, the ⌘K trigger, status pill placeholder, ⚙ link), nav collapsing to icons below 1100px, a `g o/g f/g e/g g/g h/g a` keyboard nav hook, and placeholder pages for every route.

- [ ] **Step 6: Run the tests and build** — `vitest run` → PASS; `pnpm --dir packages/web build` → `dist/index.html` exists

- [ ] **Step 7: Commit** — `git add packages/web && git commit -m "feat(web): scaffold, design tokens, app shell"`

**Before B1:** once Agent A has pushed `contract-v1` (`git fetch --tags`), run `git merge origin/main`, delete any stray `packages/web/pnpm-lock.yaml`, `pnpm install`, add `"@catalyst/shared": "workspace:*"` to web, then `pnpm test`. Commit with the message `chore(web): join workspace`.

---

### Task B1: Fixture index (taxonomy)

**Files:**
- Create: `fixtures/index/taxonomy.json`, `packages/web/mock/fixture-schema.ts`
- Test: `packages/web/mock/fixture.test.ts`

**Interfaces:**
- Consumes: shared `ProjectDTO, OverviewDTO, FeatureListItemDTO, FeatureDetailDTO, TreeNodeDTO, XRayDTO, SourceDTO, ImpactDTO, GraphResponse, FindResultDTO, SearchResultDTO, HealthDTO, SettingsDTO, ProvidersDetectDTO, FsBrowseDTO, ProgressEvent, AskEvent, RunDTO`.
- Produces:
  ```ts
  export const FixtureIndex = z.object({
    projects: z.array(ProjectDTO),                         // [0] = taxonomy (ready), [1] = fastapi backend (never-indexed)
    overview: OverviewDTO,
    features: z.array(FeatureListItemDTO),
    featureDetails: z.record(z.string(), FeatureDetailDTO),// by feature id
    tree: TreeNodeDTO,
    nodes: z.record(z.string(), XRayDTO),                  // by node id
    sources: z.record(z.string(), SourceDTO),              // by node id (file nodes at least)
    impact: z.record(z.string(), ImpactDTO),               // by node id
    graph: z.object({ file: GraphResponse, feature: GraphResponse }),
    find: z.record(z.string(), z.array(FindResultDTO)),    // by lower-cased query; '*' = default
    search: z.record(z.string(), z.array(SearchResultDTO)),
    health: HealthDTO,
    settings: SettingsDTO, providersDetect: ProvidersDetectDTO, fsBrowse: FsBrowseDTO,
    run: RunDTO, runEvents: z.array(ProgressEvent),
    askScripts: z.record(z.string(), z.array(AskEvent)),   // by question; '*' = generic fallback
  });
  export type FixtureIndex = z.infer<typeof FixtureIndex>;
  export function loadFixture(): FixtureIndex;             // reads + parses fixtures/index/taxonomy.json
  ```

- [ ] **Step 1: Write the failing tests**

```ts
test('fixture parses', () => expect(() => loadFixture()).not.toThrow());
test('every referenced node id exists', () => {
  const f = loadFixture(); const known = collectTreeIds(f.tree).concat(Object.keys(f.nodes));
  const refs = collectRefs(f);                             // all NodeRef.id + all [[id]] in markdown/summary strings
  expect(refs.filter(id => !known.includes(id) && !id.startsWith('feature:'))).toEqual([]);
});
test('has the demo content', () => {
  const f = loadFixture();
  expect(f.features.map(x => x.id)).toEqual(expect.arrayContaining(['feature:authentication','feature:billing-subscriptions','feature:posts-editor','feature:dashboard','feature:marketing-docs','feature:shared']));
  expect(f.askScripts['Where do we handle Stripe webhooks?'].at(-1)).toMatchObject({ type: 'done', answer: { found: true } });
  expect(f.askScripts['Do we have password reset?'].at(-1)).toMatchObject({ type: 'done', answer: { found: false } });
});
```

- [ ] **Step 2: Run them** — `pnpm --filter @catalyst/web vitest run mock/fixture.test.ts` → FAIL

- [ ] **Step 3: Author the fixture** by reading `../catalyst-testbeds/taxonomy`. Use about 40 real file nodes (app router pages/layouts, `app/api/**/route.ts` including the Stripe webhook, `lib/session.ts`, `lib/auth.ts`, `lib/stripe.ts`, `lib/subscription.ts`, `lib/db.ts`, the editor components, `prisma/schema.prisma`) with real symbol names, the five features plus `feature:shared` with flows (at least one step with `edgeVerified: false`), and changeability cards (one `hard`). Include flags: at least one `hub`, a `god-file` and an `unused-export`, plus a `cycle` if the repo really has one (otherwise invent none). Add `runEvents` covering every stage through `done`, and the two ask scripts using `thinking`/`tool`/`token`/`done` events with `[[id]]` citations. Use IDs built with the `ids.*` rules.

- [ ] **Step 4: Run them** → PASS. **Step 5: Commit** — `git add fixtures/index packages/web/mock && git commit -m "feat(web): taxonomy fixture index + schema"`

---

### Task B2: Mock API, API client, SSE hooks

**Files:**
- Create: `packages/web/mock/handlers.ts`, `packages/web/mock/plugin.ts`, `packages/web/src/test/mockFetch.ts`
- Create: `packages/web/src/api/{client.ts,errors.ts,token.ts,sse.ts}`, `src/api/hooks/{queries.ts,useRunEvents.ts,useAsk.ts,useServerStatus.ts}`
- Modify: `packages/web/vite.config.ts` (proxy `/api` → `http://127.0.0.1:4321`; with `mode === 'mock'`, register the plugin instead)
- Test: `src/api/client.test.ts`, `src/api/hooks/useAsk.test.tsx`, `mock/handlers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // mock/handlers.ts — shared by the Vite plugin and by tests
  export function handleMock(f: FixtureIndex, req: { method: string; url: string; body?: unknown }):
    { status: number; json?: unknown; sse?: { event: string; data: unknown; delayMs: number }[] };
  // src/test/mockFetch.ts
  export function installMockFetch(f?: FixtureIndex, overrides?: Record<string, (req) => Response>): void;

  // src/api/errors.ts
  export class ApiError extends Error { code: ErrorCode | 'SERVER_GONE'; status: number; details?: unknown }
  // src/api/token.ts
  export function getToken(): string | null;   // <meta name="catalyst-token">, else ?token= (moved to sessionStorage, then stripped from the URL), else sessionStorage
  // src/api/client.ts — one function per endpoint in 08 §2 (MVP rows)
  export const api: {
    health(): Promise<HealthResponse>;
    settings: { get(): Promise<SettingsDTO>; update(u: SettingsUpdate): Promise<SettingsDTO>; test(p?: ProviderConfig): Promise<TestProviderResult> };
    providersDetect(): Promise<ProvidersDetectDTO>;
    browse(path?: string): Promise<FsBrowseDTO>;
    projects: { list(): Promise<ProjectDTO[]>; open(path: string): Promise<ProjectDTO>; get(pid: string): Promise<ProjectDTO> };
    index: { start(pid: string, req?: IndexRequest): Promise<{ runId: string }>; run(pid: string, rid: string): Promise<RunDTO>; cancel(pid: string, rid: string): Promise<{ ok: true }> };
    overview(pid: string, lang?: Lang): Promise<OverviewDTO>;
    features: { list(pid: string, lang?: Lang): Promise<FeatureListItemDTO[]>; get(pid: string, fid: string, lang?: Lang): Promise<FeatureDetailDTO> };
    tree(pid: string, path?: string, depth?: number): Promise<TreeNodeDTO>;
    node(pid: string, id: string, lang?: Lang): Promise<XRayDTO>;
    source(pid: string, id: string, range?: { start: number; end: number }): Promise<SourceDTO>;
    impact(pid: string, id: string, o?: { direction?: 'up'|'down'|'both'; depth?: number; kinds?: EdgeKind[] }): Promise<ImpactDTO>;
    graph(pid: string, q: Partial<GraphQuery>): Promise<GraphResponse>;
    find(pid: string, q: string, o?: { kinds?: NodeKind[]; limit?: number }): Promise<FindResultDTO[]>;
    search(pid: string, q: string, o?: { kind?: NodeKind; limit?: number }): Promise<SearchResultDTO[]>;
    projectHealth(pid: string, f?: { severity?: Severity; rule?: string; feature?: string }): Promise<HealthDTO>;
    urls: { runEvents(pid: string, rid: string): string; ask(pid: string): string };
  };
  export function onIndexHeader(cb: (pid: string, runId: string) => void): () => void;  // fired with each X-Catalyst-Index response header
  // hooks (10 §5)
  export function useRunEvents(pid: string, runId: string | null): { events: ProgressEvent[]; last?: ProgressEvent; status: 'open'|'done'|'error' };
  export function useAsk(pid: string): { ask(q: string, history?: AskRequest['history']): void; trace: AskEvent[]; text: string; answer?: AskAnswer; status: 'idle'|'streaming'|'done'|'error'; error?: ApiError; cancel(): void };
  export function useServerStatus(): { serverGone: boolean };   // set by SERVER_GONE; polls api.health() every 3 s until it's back
  // queries.ts: useProjects, useProject (refetchInterval 5000 while indexing), useOverview, useFeatures, useFeature, useTree,
  //             useNode, useSource, useImpact, useGraph, useFind, useSearch, useHealth, useSettings, useProvidersDetect, useBrowse
  //             — the query keys exactly as in 10 §5
  ```

- [ ] **Step 1: Write the failing tests**

```ts
test('encodes route-group node ids', async () => {
  const seen: string[] = []; installMockFetch(undefined, { '*': (r) => (seen.push(r.url), Response.json(sampleXRayDTO)) });
  await api.node('p1', 'sym:app/(dashboard)/editor/[postId]/page.tsx#default');
  expect(seen[0]).toContain('/api/projects/p1/nodes/sym%3Aapp%2F(dashboard)%2Feditor%2F%5BpostId%5D%2Fpage.tsx%23default');
});
test('mutations send the token', async () => { /* <meta name=catalyst-token content=tok>; api.projects.open('/x') → header X-Catalyst-Token: tok */ });
test('error body becomes ApiError', async () => { /* 409 {error:{code:'NOT_INDEXED'}} → rejects with ApiError code NOT_INDEXED */ });
test('network failure raises SERVER_GONE', async () => {
  globalThis.fetch = () => Promise.reject(new TypeError('fetch failed'));
  await expect(api.projects.list()).rejects.toMatchObject({ code: 'SERVER_GONE' });
});
test('dev mode rejects contract drift', async () => { /* overview missing `stack` → throws with zod issue path */ });
test('useAsk streams tokens and resolves answer', async () => { /* mock SSE from askScripts → text accumulates; answer.found === true */ });
test('mock serves every MVP route', () => { for (const [m, u] of MVP_ROUTES) expect(handleMock(loadFixture(), { method: m, url: u }).status).toBeLessThan(400); });
```

- [ ] **Step 2: Run them** → FAIL

- [ ] **Step 3: Implement.** `handleMock` matches routes with a small path matcher. SSE routes return `sse` frames: `runEvents` at 120 ms each, and ask scripts at 40 ms per token. An unknown question uses `'*'`. `plugin.ts` adapts `handleMock` to a Connect middleware and writes SSE with the [08 §1 framing](../docs/08-api.md#sse-framing). The client validates responses with the shared schema only when `import.meta.env.DEV`. SSE parsing uses `eventsource-parser`. `useRunEvents` uses `EventSource` and reconnects with `Last-Event-ID`; `useAsk` uses `fetch` + `ReadableStream` with an `AbortController`.

- [ ] **Step 4: Run them** → PASS; also check `pnpm --filter @catalyst/web dev:mock`, where `curl localhost:5173/api/projects` returns the fixture projects.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): mock API, typed client, SSE hooks"`

---

### Task B3: Shared components

**Files:**
- Create: `src/components/{NodeLink,CitationChip,ProvenanceBadge,FlagBadge,FeatureDot,FeatureChip,Markdown,EmptyState,NoAIBanner,StatusPill,ErrorCard,Skeleton}.tsx`, `src/components/remarkCitations.ts`
- Test: `src/components/Markdown.test.tsx`, `src/components/badges.test.tsx`

**Interfaces:**
- Consumes: `NodeRef`, `Provenance`, `Severity`, `ProjectDTO`, and `useNode` (for the NodeLink hover card).
- Produces: the props exactly as in the [10 §4 table](../docs/10-web-ui.md#4-shared-components). `remarkCitations(): Plugin` turns `[[id]]` text into `citation` mdast nodes. `<Markdown text citations?>` renders those through `CitationChip`. `ErrorCard({ error: ApiError, onRetry })` links `PROVIDER_ERROR` to `/settings`.

- [ ] **Step 1: Write the failing tests**

```tsx
test('citations become chips linking to explorer', () => {
  render(<Markdown text="Handled in [[file:app/api/webhooks/stripe/route.ts]]." citations={[ref('file:app/api/webhooks/stripe/route.ts','route.ts')]} />, { route: '/p/p1/ask' });
  expect(screen.getByRole('link', { name: /route\.ts/ })).toHaveAttribute('href', expect.stringContaining('/p/p1/explorer?node=file%3Aapp'));
});
test('unknown citation renders muted text, no link', () => {
  render(<Markdown text="See [[sym:nope.ts#x]]." citations={[]} />);
  expect(screen.queryByRole('link')).toBeNull(); expect(screen.getByText('nope.ts#x')).toHaveClass('text-muted');
});
test('ProvenanceBadge shows confidence for inferred', () => { render(<ProvenanceBadge provenance="inferred" confidence={0.62} />); expect(screen.getByText(/AI-inferred · 62%/)).toBeInTheDocument(); });
test('StatusPill states', () => { /* ready → "Ready"; indexing w/ activeRunId → "Indexing"; aiStatus skipped → "Structure only"; stale → "Stale" */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (shadcn primitives for HoverCard/Tooltip/Badge). **Step 4: Run** → PASS. **Step 5: Commit** — `feat(web): shared components + citation markdown`

---

### Task B4: Launcher and Settings

**Files:**
- Create: `src/pages/Launcher.tsx`, `src/pages/launcher/{PathInput,DirBrowser,RecentProjects}.tsx`, `src/pages/Settings.tsx`, `src/pages/settings/{ProviderForm,ModelFields}.tsx`
- Test: `src/pages/Launcher.test.tsx`, `src/pages/Settings.test.tsx`

**Interfaces:** Consumes `api.projects.*`, `api.browse`, `api.index.start`, `api.settings.*`, `api.providersDetect`. The Launcher reads `?suggest=<abs path>` (passed by the CLI, see B12) to pre-fill the input.

- [ ] **Step 1: Write the failing tests**

```tsx
test('open path → registers, starts index, navigates to indexing', async () => {
  renderAt('/'); await user.type(screen.getByLabelText(/folder path/i), '/home/me/taxonomy{enter}');
  expect(calls('POST /api/projects')[0].body).toEqual({ path: '/home/me/taxonomy' });
  expect(await screen.findByTestId('page-indexing')).toBeInTheDocument();
});
test('recents list shows status', async () => { renderAt('/'); expect(await screen.findByText('taxonomy')).toBeInTheDocument(); });
test('?suggest prefills input', () => { renderAt('/?suggest=%2Fhome%2Fme%2Fapp'); expect(screen.getByLabelText(/folder path/i)).toHaveValue('/home/me/app'); });
test('settings never echoes the key; shows masked', async () => { renderAt('/settings'); expect(await screen.findByText(/sk-or-…/)).toBeInTheDocument(); expect(screen.getByLabelText(/api key/i)).toHaveValue(''); });
test('claude code offered when detected', async () => { /* providersDetect.claudeCli.found → option "Claude Code CLI (detected)" */ });
test('test connection shows latency', async () => { /* click Test → "Connected · 420 ms" */ });
test('PUT omits apiKey when untouched', async () => { /* change model only → body.provider has no apiKey */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** per [10 §3.1](../docs/10-web-ui.md#31-launcher--project-picker) and [10 §3.10](../docs/10-web-ui.md#310-settings). This includes the "fully local" badge for localhost `openai-compatible` and the privacy line ([12 §5](../docs/12-config-and-privacy.md#5-privacy-guarantees)). **Step 4: Run** → PASS. **Step 5: Commit** — `feat(web): launcher + settings`

---

### Task B5: Indexing progress

**Files:** Create `src/pages/Indexing.tsx`, `src/components/SseProgress.tsx`. Test: `src/pages/Indexing.test.tsx`.

**Interfaces:** Consumes `useProject(pid)` (`activeRunId`), `useRunEvents`, `api.index.cancel`, `api.index.start`.

- [ ] **Step 1: Write the failing tests**

```tsx
test('renders every stage with counts from events', async () => { renderAt('/p/p1/indexing'); expect(await screen.findByText(/summarize/i)).toBeInTheDocument(); expect(await screen.findByText('129/129')).toBeInTheDocument(); });
test('done → navigates to overview and invalidates project queries', async () => { /* last event stage 'done' → page-overview */ });
test('cancel calls cancel endpoint', async () => { /* click Cancel → POST /runs/:rid/cancel */ });
test('no provider → Connect AI step with Skip (structure only)', async () => { /* settings.provider null → "Connect AI" + Skip → POST index {ai:false} */ });
test('degraded stage shows banner', async () => { /* event degraded:true → "Some explanations failed" */ });
```

- [ ] **Steps 2–5:** run → FAIL; implement per [10 §3.2](../docs/10-web-ui.md#32-indexing-progress); run → PASS; commit `feat(web): indexing progress`

---

### Task B6: Overview

**Files:** Create `src/pages/Overview.tsx`, `src/pages/overview/{StackChips,FeatureCards,EntryPoints,Gaps,HealthSnapshot}.tsx`. Test: `src/pages/Overview.test.tsx`.

**Interfaces:** Consumes `useOverview(pid, lang)`; `FeatureListItemDTO.colorIndex` → `--feature-N`.

- [ ] **Step 1: Write the failing tests**

```tsx
test('shows one-liner as the page headline and feature cards', async () => {
  renderAt('/p/p1/overview'); const f = loadFixture();
  expect(await screen.findByRole('heading', { level: 1, name: f.overview.overview!.oneLiner })).toBeInTheDocument();
  expect(screen.getAllByTestId('feature-card')).toHaveLength(f.overview.features.length);
});
test('no-AI overview shows stack and banner', async () => {
  installMockFetch({ ...loadFixture(), overview: { ...loadFixture().overview, overview: null } });
  renderAt('/p/p1/overview'); expect(await screen.findByText(/connect an ai/i)).toBeInTheDocument();
  expect(screen.getByText('Next.js')).toBeInTheDocument();
});
test('feature card links to feature detail', async () => { /* click "Billing & Subscriptions" → /p/p1/features/feature%3Abilling-subscriptions */ });
```

- [ ] **Steps 2–5:** run → FAIL; implement per [10 §3.3](../docs/10-web-ui.md#33-overview) (typographic hierarchy: one-liner, then prose, then structure; not a tile grid); run → PASS; commit `feat(web): overview`

**→ Sync S1** (≈15:15): follow [README §Git workflow](README.md#git-workflow). Before merging, run `pnpm test && pnpm typecheck && pnpm --filter @catalyst/web build`, all green.

---

### Task B7: Features list and detail

**Files:** Create `src/pages/Features.tsx`, `src/pages/FeatureDetail.tsx`, `src/pages/features/{FlowSteps,MembersByRole,ChangeabilityCard,DependsOn}.tsx`. Test: `src/pages/FeatureDetail.test.tsx`.

**Interfaces:** Consumes `useFeatures`, `useFeature` → `FeatureDetailDTO` (members carry `node: NodeRef`).

- [ ] **Step 1: Write the failing tests**

```tsx
test('flow steps numbered; unverified hop is dashed', async () => {
  renderAt('/p/p1/features/feature%3Abilling-subscriptions');
  const steps = await screen.findAllByTestId('flow-step'); expect(steps[0]).toHaveTextContent('1');
  expect(screen.getAllByTestId('flow-hop').some(h => h.dataset.verified === 'false')).toBe(true);
});
test('changeability card shows three ease pills with reasons', async () => { /* "Add", "Change", "Remove" each with easy|moderate|hard + reason */ });
test('members grouped by role', async () => { /* headings Entry points, Core, Data … */ });
test('feature:shared listed last', async () => { renderAt('/p/p1/features'); const items = await screen.findAllByTestId('feature-row'); expect(items.at(-1)).toHaveTextContent(/shared/i); });
```

- [ ] **Steps 2–5:** run → FAIL; implement per [10 §3.4](../docs/10-web-ui.md#34-features); run → PASS; commit `feat(web): features list + detail`

---

### Task B8: Explorer and X-Ray panel

**Files:** Create `src/pages/Explorer.tsx`, `src/pages/explorer/{FileTree,SourceView,Outline,XRayPanel}.tsx`, `src/lib/shiki.ts`. Test: `src/pages/Explorer.test.tsx`, `src/lib/shiki.test.ts`.

**Interfaces:**
- Consumes `useTree`, `useSource`, `useNode` (XRayDTO), `useImpact`.
- Produces `highlight(code: string, language: string, theme: 'light'|'dark'): Promise<string>`, which lazy-loads only the language requested (`typescript, tsx, javascript, jsx, python, go, json, prisma` fallback `text`) and uses a singleton highlighter.

- [ ] **Step 1: Write the failing tests**

```tsx
test('deep link selects node with route-group id', async () => {
  const id = 'sym:app/(dashboard)/editor/[postId]/page.tsx#default';
  renderAt(`/p/p1/explorer?node=${encodeURIComponent(id)}`);
  expect(await screen.findByTestId('xray-panel')).toHaveAttribute('data-node', id);
});
test('X-Ray shows the 10 §3.5 sections', async () => {
  renderAt(`/p/p1/explorer?node=${encodeURIComponent('file:lib/session.ts')}`);
  for (const h of ['What it does','Where it sits','Connections','Side effects','If you change this','Health','Provenance'])
    expect(await screen.findByRole('heading', { name: h })).toBeInTheDocument();
});
test('clicking a tree file updates ?node=', async () => { /* click lib/session.ts → location.search contains node=file%3Alib%2Fsession.ts */ });
test('?line= scrolls and highlights the line', async () => { /* data-line=12 has class line-highlight */ });
test('unknown language falls back to plain text', async () => expect(await highlight('x', 'cobol', 'light')).toContain('x'));
```

- [ ] **Steps 2–5:** run → FAIL; implement per [10 §3.5](../docs/10-web-ui.md#35-explorer--x-ray-panel). The tree shows feature colour dots and flag counts. Upstream/downstream lists show a `ProvenanceBadge` per edge. "If you change this" shows `impactPreview` plus a "Show in graph" link (`/graph?focus=<id>`). The X-Ray becomes an overlay sheet below 900px. Run → PASS; commit `feat(web): explorer + x-ray`

---

### Task B9: Graph view

**Files:** Create `src/pages/Graph.tsx`, `src/pages/graph/{elements.ts,impactClasses.ts,GraphCanvas.tsx,GraphFilters.tsx,cyStyle.ts}`. Test: `src/pages/graph/elements.test.ts`, `src/pages/Graph.test.tsx`.

**Interfaces:**
- Consumes `useGraph(pid, query)` → `GraphResponse`, `useImpact`.
- Produces:
  ```ts
  export function toElements(g: GraphResponse, colorIndex: Record<string, number>): cytoscape.ElementDefinition[]; // compound parents via node.parent; data.color = feature palette
  export function impactClasses(impact: ImpactDTO): Map<string, 'root' | 'up' | 'down'>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
test('compound parents preserved', () => { const els = toElements(loadFixture().graph.file, {}); expect(els.some(e => e.data.parent)).toBe(true); });
test('edges carry provenance class', () => { /* heuristic edge → classes includes 'heuristic' (rendered dashed) */ });
test('impact classes split up/down and mark root', () => { const m = impactClasses(loadFixture().impact['file:lib/session.ts']); expect(m.get('file:lib/session.ts')).toBe('root'); expect([...m.values()]).toContain('up'); });
test('truncated graph shows fallback', async () => {
  installMockFetch({ ...loadFixture(), graph: { ...loadFixture().graph, file: { ...loadFixture().graph.file, truncated: true, totalNodes: 2400 } } });
  renderAt('/p/p1/graph?level=file'); expect(await screen.findByText(/too many nodes/i)).toBeInTheDocument();
});
test('level + filters round-trip through the URL', async () => { /* toggle edge kind → ?edgeKinds=imports,calls */ });
```

- [ ] **Steps 2–5:** run → FAIL; implement per [10 §3.6](../docs/10-web-ui.md#36-graph). Use Cytoscape with `cytoscape-fcose`, run with `headless: true` in tests. A click runs `useImpact(id, 'both', depth)` and then applies the classes `up` (`--blast-up`), `down` (`--blast-down`) and `root`, dimming everything else. Double-click opens the Explorer. Show "Laying out…" while fcose runs. Run → PASS; commit `feat(web): graph view with blast radius`

---

### Task B10: Cmd-K palette and Ask

**Files:** Create `src/components/CommandPalette.tsx`, `src/pages/Ask.tsx`, `src/pages/ask/{AskTrace,AskAnswerView,SuggestedQuestions}.tsx`. Test: `src/components/CommandPalette.test.tsx`, `src/pages/Ask.test.tsx`.

**Interfaces:** Consumes `useFind`, `useSearch` (debounced 120 ms; `cmdk`), `useAsk`. The palette opens on `⌘/Ctrl+K` and from the top-bar trigger.

- [ ] **Step 1: Write the failing tests**

```tsx
test('palette groups Find, Search and an Ask row', async () => {
  renderAt('/p/p1/overview'); await user.keyboard('{Control>}k{/Control}'); await user.type(screen.getByRole('combobox'), 'stripe webhook');
  expect(await screen.findByText('Find')).toBeInTheDocument(); expect(screen.getByText('Search')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: /ask: stripe webhook/i })).toBeInTheDocument();
});
test('Enter on ask row navigates to /ask?q=', async () => { /* → location /p/p1/ask?q=stripe%20webhook and the ask starts */ });
test('ask streams then shows cited answer', async () => { renderAt('/p/p1/ask?q=Where%20do%20we%20handle%20Stripe%20webhooks%3F'); expect(await screen.findByRole('link', { name: /route\.ts/ })).toBeInTheDocument(); });
test('found=false renders the not-found treatment with searched list', async () => { /* "Not found — here's what I checked" + each searched item */ });
test('ask without AI shows NoAIBanner', async () => { /* POST /ask → 412 AI_NOT_CONFIGURED → banner + "Search instead" */ });
```

- [ ] **Steps 2–5:** run → FAIL; implement per [10 §3.7](../docs/10-web-ui.md#37-cmd-k-search-palette) and [10 §3.8](../docs/10-web-ui.md#38-ask). The tool trace is collapsed by default. Offer suggested questions. Keep the chat history in component state (no persistence; that's Stretch). Run → PASS; commit `feat(web): command palette + ask`

---

### Task B11: Health screen and global states

**Files:** Create `src/pages/Health.tsx`, `src/pages/health/{FlagList,CycleList,MetricsTables}.tsx`, `src/shell/{ServerGoneBanner,StaleToast,PartialAiStrip}.tsx`. Modify `src/shell/AppShell.tsx`, `src/shell/TopBar.tsx` (the real project switcher and `StatusPill`). Test: `src/pages/Health.test.tsx`, `src/shell/states.test.tsx`.

**Interfaces:** Consumes `useHealth`, `useServerStatus`, `onIndexHeader` + `useProject` (`lastRunId`).

- [ ] **Step 1: Write the failing tests**

```tsx
test('flags grouped by rule with plain titles and "why this matters"', async () => { renderAt('/p/p1/health'); expect(await screen.findByRole('heading', { name: /hub/i })).toBeInTheDocument(); expect(screen.getAllByText(/why this matters/i).length).toBeGreaterThan(0); });
test('severity filter lives in the URL', async () => { /* click High → ?severity=high, warn rows hidden */ });
test('cycle rendered as a path a → b → a', async () => { /* when fixture has a cycle */ });
test('no 0–100 score anywhere', async () => { renderAt('/p/p1/health'); expect(screen.queryByText(/\/\s*100|score/i)).toBeNull(); });
test('server-gone banner appears and clears', async () => { /* fetch rejects → banner "Catalyst isn't running"; health OK again → banner gone */ });
test('stale toast when X-Catalyst-Index differs from lastRunId', async () => { /* header r_new vs project.lastRunId r_old → "New results available" */ });
```

- [ ] **Steps 2–5:** run → FAIL; implement per [10 §3.9](../docs/10-web-ui.md#39-health), [10 §7](../docs/10-web-ui.md#7-states) and [11 §5](../docs/11-health-analysis.md#5-presentation-guidance-consumed-by-10-web-uimd). The tone is non-judgmental, and hubs are shown as information. Run → PASS; commit `feat(web): health + global states`

---

### Task B12: CLI

**Files:**
- Create: `packages/cli/src/{index.ts,main.ts,node-check.ts,exit-codes.ts,urls.ts,progress.ts,terminal-citations.ts,config-keys.ts}`, `packages/cli/src/commands/{default,ui,serve,index-cmd,ask,config}.ts`
- Create: `packages/cli/test/fake-engine.ts`
- Test: `packages/cli/src/{main.test.ts,progress.test.ts,config-keys.test.ts,node-check.test.ts}`

**Interfaces:**
- Consumes: `Engine`, `Project`, `IndexRun`, `createEngine(opts: EngineOptions)` from `@catalyst/core`; `startServer(engine, opts: ServerOptions)` from `@catalyst/server` ([F3](00-foundation.md#task-f3-public-interfaces-of-core-and-server-typed-stubs)). Port fallback (+20) happens **inside `startServer`**. The CLI only prints the returned `url`/`port`.
- Produces:
  ```ts
  export const EXIT = { OK: 0, FAIL: 1, BAD_ARGS: 2, NOT_FOUND: 3, NO_AI: 4, PROVIDER: 5, NODE: 6, INTERRUPTED: 130 } as const; // 09 §3
  export function checkNode(version?: string): { ok: true } | { ok: false; message: string };   // < 22 → 09 §5 text
  export interface CliDeps {
    createEngine: (o: EngineOptions) => Engine; startServer: typeof startServer;
    openBrowser: (url: string) => Promise<void>; stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream;
    cwd: string; env: NodeJS.ProcessEnv; isTTY: boolean; staticDir?: string; grammarsDir?: string;
  }
  export function buildProgram(deps: CliDeps): Command;          // commander program; actions return exit codes
  export function launchUrl(base: string, p: ProjectDTO | null, opts?: { suggest?: string }): string;
    // null → '/' (with ?suggest=); indexing/never-indexed → /p/:pid/indexing; else /p/:pid/overview
  export function createProgressRenderer(o: { stream: NodeJS.WritableStream; isTTY: boolean; fps?: number /*10*/ }):
    { update(e: ProgressEvent): void; finish(run: RunDTO): void };
  export function renderCitationsForTerminal(md: string, citations: NodeRef[]): string;  // [[id]] → path:line; appends "Sources"
  export function configSetToUpdate(key: string, value: string, current: SettingsDTO): SettingsUpdate;
    // keys: provider.type|provider.apiKey|provider.baseUrl|provider.binary|models.fast|models.smart|outputLanguage|budgetUsd|concurrency
    // unknown key or bad value → throws CliError(EXIT.BAD_ARGS)
  ```
- `index.ts` is the bin entry. It runs `checkNode()` **before** `await import('./main.js')`, so an old Node shows the friendly message and exits 6.

- [ ] **Step 1: Write the failing tests** (all against `FakeEngine`, which implements `Engine` with an in-memory project, a scripted `IndexRun.events()` and a scripted `ask()`)

```ts
test('non-project cwd opens launcher', async () => { const d = deps({ cwd: '/tmp/empty' }); await run(d, []); expect(d.opened[0]).toMatch(/:\d+\/(\?suggest=.*)?$/); });
test('project cwd never-indexed starts index and opens /indexing', async () => { const d = deps({ cwd: '/r/taxonomy' }); await run(d, []); expect(fake.indexCalls).toHaveLength(1); expect(d.opened[0]).toMatch(/\/p\/[0-9a-f]{12}\/indexing$/); });
test('ready project opens overview without indexing', async () => { /* status ready → /overview, indexCalls 0 */ });
test('ui always opens launcher even in a project', async () => { /* catalyst ui → '/?suggest=%2Fr%2Ftaxonomy' */ });
test('missing path exits 3', async () => expect(await run(deps(), ['/nope'])).toBe(EXIT.NOT_FOUND));
test('prints port returned by startServer', async () => { /* fake startServer returns port 4322 → stdout contains http://127.0.0.1:4322 */ });
test('--no-ai passes ai:false', async () => { /* index called with { ai: false } */ });
test('ask not indexed exits 3; no AI exits 4; prints Not found + Checked', async () => { /* … */ });
test('index --json prints RunDTO on stdout, progress on stderr', async () => { /* … */ });
test('config set provider.apiKey keeps provider type', () => expect(configSetToUpdate('provider.apiKey','sk-x', settingsWith('openrouter'))).toEqual({ provider: { type: 'openrouter', apiKey: 'sk-x', baseUrl: 'https://openrouter.ai/api/v1' } }));
test('config set bad key → BAD_ARGS', () => expect(() => configSetToUpdate('nope', '1', s)).toThrow(expect.objectContaining({ exitCode: 2 })));
test('checkNode rejects 18', () => expect(checkNode('18.19.0')).toMatchObject({ ok: false, message: expect.stringContaining('Node.js 22') }));
test('non-TTY progress prints one line per stage transition', () => { /* [catalyst] parse 129/129 */ });
test('renderCitationsForTerminal', () => expect(renderCitationsForTerminal('See [[sym:lib/session.ts#getCurrentUser]]', [ref('sym:lib/session.ts#getCurrentUser','getCurrentUser','lib/session.ts',12)])).toContain('lib/session.ts:12'));
```

- [ ] **Step 2: Run** — `pnpm --filter catalyst-dx vitest run` → FAIL

- [ ] **Step 3: Implement** per [09](../docs/09-cli.md). Use `engine.isProjectDir(path)` for detection. `engine.projects.open()` handles `.catalyst/` and `.gitignore` (09 §4), and the CLI prints the notice the engine logs. For a non-project subdirectory, walk up looking for a project marker and pass the first ancestor that has one as `?suggest=`. The TTY renderer redraws the [09 §3 block](../docs/09-cli.md#terminal-output-interactive-tty) at most 10 fps. Ctrl+C once calls `run.cancel()`, keeps the server for 2 s and then exits 130; pressing it twice exits immediately. `--verbose` sets `CATALYST_LOG=debug`. The provider line comes from `engine.settings.get()`.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `feat(cli): commands, progress renderer, config, exit codes`

---

### Task B13: Packaging (`catalyst-dx`)

**Files:**
- Create: `packages/cli/tsup.config.ts`, `packages/cli/scripts/copy-assets.mjs`, `packages/cli/README.md` (npm readme: quickstart, providers, privacy line)
- Modify: `packages/cli/package.json` (`"bin": { "catalyst": "./dist/index.js" }`, `"files": ["dist"]`, `"engines": { "node": ">=22" }`, deps)
- Test: `packages/cli/scripts/pack.test.ts`

**Interfaces:**
- `tsup`: entries `src/index.ts` and `src/main.ts`; ESM; `platform: 'node'`; `target: 'node22'`; `splitting: true`; banner `#!/usr/bin/env node`; `noExternal: [/^@catalyst\//]`; `external: ['better-sqlite3', 'web-tree-sitter']`. Those two are listed in `catalyst-dx` `dependencies`, **pinned to the same versions as `packages/core/package.json`**; read them from there and don't guess.
- `copy-assets.mjs`: copies `packages/web/dist/**` → `packages/cli/dist/web/`, and `tree-sitter-wasms/out/tree-sitter-{typescript,tsx,javascript,python,go}.wasm` → `packages/cli/dist/grammars/`.
- At runtime `main.ts` passes `staticDir = <dist>/web` and `grammarsDir = <dist>/grammars` (resolved from `import.meta.url`) into `startServer` and `createEngine({ grammarsDir })`.
- The `build` script runs `pnpm --filter @catalyst/web build && tsup && node scripts/copy-assets.mjs`.

- [ ] **Step 1: Write the failing test**

```ts
test('packed tarball has bin, web and grammars', () => {
  execSync('pnpm --filter catalyst-dx build', { stdio: 'inherit' });
  const out = execSync('pnpm pack --pack-destination /tmp/catalyst-pack', { cwd: 'packages/cli' }).toString();
  const list = execSync(`tar -tzf ${tarPath(out)}`).toString();
  expect(list).toContain('package/dist/index.js'); expect(list).toContain('package/dist/web/index.html');
  for (const g of ['typescript','tsx','javascript','python']) expect(list).toContain(`package/dist/grammars/tree-sitter-${g}.wasm`);
});
test('bin prints version', () => expect(execSync('node packages/cli/dist/index.js --version').toString()).toMatch(/\d+\.\d+\.\d+/));
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. Then do a manual smoke test: `node packages/cli/dist/index.js ui --no-open` prints a URL. (Against the stubbed engine the UI may show errors; that's expected until A's engine is merged.)

- [ ] **Step 5: Commit** — `feat(cli): bundle catalyst-dx with web + grammars`

**→ Sync S2** (≈16:15): final merge of `experience` to `main` per [README §Git workflow](README.md#git-workflow). Hand off to the integration agent ([03](03-integration-and-testing.md)).

---

## Stretch (after S2, or on the integration machine; in this order)

Each one follows the same pattern: failing test → implement → pass → commit.

- **B14 `catalyst mcp [path]`** — `src/commands/mcp.ts` calls `startMcp(engine, root)` from `@catalyst/server` (signature `startMcp(engine: Engine, path: string): Promise<void>`) (added by Agent A's A20). Everything goes to stderr, with stdout reserved for MCP frames. Test: `mcp command writes nothing to stdout before frames` (FakeEngine + stub `startMcp`).
- **B15 Impact screen + `catalyst impact`** — `src/pages/Impact.tsx` per [10 §3.11](../docs/10-web-ui.md#311-impact-stretch); the CLI output per [09 `impact`](../docs/09-cli.md#catalyst-impact-path-stretch). Test: `impact page lists affected features and routes from DiffImpactDTO`.
- **B16 Flow diagram** — React Flow + ELK in `src/pages/features/FlowDiagram.tsx`, toggled next to `FlowSteps`; unverified hops are dashed. Test: `flowToGraph maps steps to nodes and edges with verified flag` (pure function).
- **B17 "Copy for AI"** — an X-Ray button that copies a markdown block (purpose, position, callers/callees with paths, side effects, flags). Test: `copyForAi(xray) includes paths and callers`.
- **B18 `catalyst health`** — the terminal output per [09 `health`](../docs/09-cli.md#catalyst-health-path-mvp-backend-cli-stretch). Test: `health prints cycles as a → b → a`.
- **B19 Estimate dialog** — `POST /estimate` before the AI stages ([10 §3.2](../docs/10-web-ui.md#32-indexing-progress)). Test: `estimate dialog shows calls and cost or "billed to your Claude plan"`.
