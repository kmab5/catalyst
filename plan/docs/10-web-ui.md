# 10 — Web UI

React 19 + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Router. The UI is built to static files and served by the Hono server ([04](04-architecture.md)). It talks to the engine **only** through [08-api.md](08-api.md). It imports types and schemas from `@catalyst/shared`, and never from `core`.

## 1. Design direction

- **Calm and readable.** This is a reading tool. People sit on it for minutes, so it shouldn't feel like an ops dashboard. Generous line height (1.6 for prose), measured line length (≤ 72ch for explanations), quiet colour, and few borders, with separation by spacing and subtle surface tints.
- **Plain English first.** Every screen opens with a sentence, not a table. Technical detail (metrics, raw edges, provenance) sits one click down, in collapsibles, a "Details" tab or hover cards.
- **Light and dark.** Both are first-class. The theme follows `prefers-color-scheme`, with a manual toggle in Settings. Colours are CSS variables (tokens) defined once.
- **Type.** A humanist sans for UI and prose, such as Inter or IBM Plex Sans (self-hosted, not fetched from a CDN, since the tool is local-first). **Monospace (JetBrains Mono / IBM Plex Mono) only for code, paths and identifiers.**
- **Colour semantics.**
  - Features get a stable 8-colour categorical palette (`FeatureListItemDTO.colorIndex`), used for dots, graph clusters and chips.
  - Blast radius uses two fixed hues: **upstream / dependants** is warm (amber) and **downstream / dependencies** is cool (teal).
  - Severity: `high` is red, `warn` is amber, `info` is slate.
  - Provenance uses neutral badges with distinct outlines rather than colours, so they don't fight with feature colours.
- **Avoid a templated look.** No generic gradient hero, no wall of identical cards, no emoji icons. Give the Overview a strong typographic hierarchy (a large one-liner, prose and then structure), not a dashboard grid of stat tiles. Use one icon set (lucide) sparingly.
- **Motion.** Minimal: 150 ms fades and slides on panels, with graph highlight transitions. Respect `prefers-reduced-motion`.
- **Keyboard.** `⌘/Ctrl+K` opens search, `g o / g f / g e / g g / g h / g a` jump to each nav item, `Esc` closes panels, and `↑↓ Enter` work in lists and the tree.

## 2. App shell

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ◆ catalyst   [taxonomy ▾]        [ ⌘K  Search or ask anything…        ]  ● Ready  ⚙ │
├────────────┬─────────────────────────────────────────────────────────────────────┤
│ Overview   │                                                                     │
│ Features   │                         <route outlet>                              │
│ Explorer   │                                                                     │
│ Graph      │                                                                     │
│ Health  3  │                                                                     │
│ Ask        │                                                                     │
│ Impact  ⋯  │  (Stretch)                                                          │
│            │                                                                     │
│ ───────    │                                                                     │
│ AI: Claude │                                                                     │
│ Code CLI   │                                                                     │
└────────────┴─────────────────────────────────────────────────────────────────────┘
```

| Element | Behaviour |
|---|---|
| **Project switcher** | A dropdown of `GET /api/projects` showing name, status dot and last indexed time, plus "Open another folder…", which goes to the Launcher |
| **Search** | Opens the Cmd-K palette (§3.7) |
| **Index status pill** | `● Ready` (green), `◐ Indexing 42%` (clickable; goes to /indexing), `● Stale` (amber; clicking re-indexes), `● Error` (red), `○ Structure only` (no AI) |
| **Settings ⚙** | Goes to `/settings` |
| **Left nav** | Health shows a count of `high` flags. Nav items that need AI (Features, Ask) stay visible in no-AI mode and show the `NoAIBanner` |
| **Footer** | The current provider name; clicking it opens Settings |

The nav collapses to icons below 1100 px. The X-Ray panel becomes an overlay sheet below 900 px. Mobile is not a target.

## 3. Screens

### 3.1 Launcher / project picker
Route: `/`. It is shown by `catalyst ui`, or by `catalyst` outside a project ([09 §1](09-cli.md#1-two-ways-in-both-are-required)).

```
┌──────────────────────────────────────────────────────────────┐
│  ◆ catalyst                                                   │
│  Understand any codebase in plain English.                    │
│                                                               │
│  Open a folder                                                │
│  [ /home/maya/code/my-app                        ] [ Open ]   │
│  ┌─ Browse ────────────────────────────────────────────────┐  │
│  │ ← /home/maya/code                                        │  │
│  │ 📁 my-app            project · indexed 2h ago            │  │
│  │ 📁 taxonomy          project                             │  │
│  │ 📁 notes                                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                               │
│  Recent                                                       │
│  taxonomy      ● Ready     ~/code/taxonomy       2h ago   →   │
│  backend       ● Stale     ~/code/fastapi/backend 1d ago  →   │
└──────────────────────────────────────────────────────────────┘
```

- The path input accepts absolute paths and `~`. "Open" calls `POST /api/projects { path }`. Then a `never-indexed` or `stale` project calls `POST /index` and goes to `/p/:pid/indexing`; otherwise it goes to `/p/:pid/overview`.
- The **Browse** pane uses `GET /api/fs/browse?path=` and lists directories only. It shows the `project` badge (`isProject`) and the `indexed` badge (`hasIndex`). Clicking a folder navigates into it, double-clicking opens it, and the selected folder fills the input.
- **Recent** lists `GET /api/projects` with a status dot. A row's overflow menu has "Re-index" and "Forget" (Stretch).
- Errors appear inline under the input (e.g. `PATH_NOT_FOUND` → "That folder doesn't exist").

### 3.2 Indexing progress
Route: `/p/:pid/indexing`. Data comes from SSE `GET /runs/:rid/events`.

```
  Indexing taxonomy
  Reading your code and figuring out how it fits together.

  ✓ Scanning files            188 files · 129 we can analyse
  ✓ Parsing code              129 / 129
  ✓ Linking imports           97% resolved
  ✓ Detecting frameworks      Next.js · Prisma · next-auth · Stripe
  ✓ Checking structure        3 issues worth a look
  ◐ Explaining each file      84 / 129   ▓▓▓▓▓▓▓▓▓░░░░░   tokens 212k / 31k
    Grouping into features
    Writing the overview

  [ Cancel ]                 [ Skip AI — show structure now ]
```

- Stage labels are plain English, with the engine stage names in a tooltip. Each line maps to a `ProgressEvent.stage`. `graph` is folded into "Linking imports", and `changeability` and `fts` are folded into "Writing the overview".
- Detected-stack chips appear as soon as `detect` completes, because the UI refetches `/overview` (deterministic `stack`) when `detect` finishes.
- **Cancel** calls `POST /runs/:rid/cancel` and goes to Overview, which shows whatever is ready.
- **Skip AI** cancels the run once the deterministic stages are done. It is only enabled from `summarize` onwards. Data already written stays usable.
- **No provider configured:** before the AI stages, an inline **Connect AI** card appears, with the provider choices from `GET /api/providers/detect` (Claude Code CLI first if found), a key field, "Test connection" and "Continue". "Continue without AI" lets the structural run finish.
- **Cost (Stretch):** before the AI stages, `POST /estimate` shows "≈ 160 AI calls · ≈ $0.40 with claude-haiku-5-5" (or "billed to your Claude plan"), with Continue and Cancel.
- When the run finishes, the page auto-navigates to Overview after 1 s.
- Errors: the failing stage turns red with its message, plus "Retry" (which re-POSTs the index; the cache makes the retry resume where it stopped).

### 3.3 Overview
Route: `/p/:pid/overview`. Data: `GET /overview`.

```
  taxonomy
  A blogging platform where people write posts and pay for a Pro plan.        ← oneLiner (display size)

  It's a Next.js app. Visitors land on marketing pages, sign in with GitHub,  ← description (prose)
  and write posts in an editor on their dashboard. Paying users get…

  Built with  [Next.js] [React] [Prisma] [PostgreSQL] [next-auth] [Stripe] [Tailwind]   ← stack chips (hover: evidence)

  What it does                                                                ← feature list (not a card grid)
  ● Authentication          Sign in with GitHub; protects the dashboard.      12 files · easy to change
  ● Billing & Subscriptions Stripe checkout + webhook keep plans in sync.      9 files · moderate
  ● Posts & Editor          Write, edit and publish posts.                     18 files · moderate
  …

  How it fits together                                                        ← architecture (prose, with [[citations]])
  Where people enter      PAGE /  ·  PAGE /dashboard  ·  POST /api/webhooks/stripe  …
  Things that may be missing   ⚠ No automated tests found  ⚠ No rate limiting on API routes   ← gaps
  Structure health        3 high · 11 warnings   → top 3 flags as one-liners, link to Health
```

- Feature rows link to `/p/:pid/features/:fid`, and entry points link to the Explorer. Clicking a stack chip opens a popover listing the evidence files.
- **No-AI mode:** the oneLiner, description, features and architecture are replaced by the `NoAIBanner`. The stack, entry points and health still render, because they come from the deterministic layer.

### 3.4 Features
Routes: `/p/:pid/features` (list) and `/p/:pid/features/:fid` (detail).

**List:** a two-column list (not cards), grouped by `category`. Each row shows the colour dot, name, summary, `memberCount`, `entryPointCount`, `flagCount` and the changeability rating.

**Detail:**

```
  ● Billing & Subscriptions                                      payments · confidence 0.86
  Stripe checkout and a webhook keep each user's plan in sync with Stripe.
  <description paragraph>

  Starts from     POST /api/webhooks/stripe   PAGE /dashboard/billing   ← entry points (NodeLink)

  How it works                                                 [ List | Diagram ]  (Diagram = Stretch)
  Upgrade to Pro — triggered when a user clicks "Upgrade" on /dashboard/billing
   1  PAGE /dashboard/billing            Shows current plan and Upgrade button        ✓ linked
   2  sym:…/billing-form.tsx#BillingForm Sends the upgrade request                    ✓ linked
   3  POST /api/users/stripe             Creates a Stripe checkout session            ✓ linked
   4  svc:stripe                         Stripe hosts the payment page                ~ AI-inferred
   …
  Stripe webhook — …

  Uses data        db:prisma:User (reads, writes)
  Talks to         svc:stripe
  Depends on       ● Authentication
  Used by          —

  How easy is it to change?  ── changeability card (see 11 §4) ──
   Add to it: easy · Modify: moderate · Remove: hard
   <plain-English reasoning with [[citations]]> · risks · files you'd touch

  Files & code (by role)    entry (2) · core (3) · data (1) · ui (2) · config (1)   ← grouped NodeLink lists with summary purpose
```

- Flow step indicator: `✓ linked` when `edgeVerified` is true (the engine found a graph path from the previous step). `~ AI-inferred` (muted) when it is false, with the tooltip "The AI connected these steps; Catalyst couldn't find a direct code path."
- **Diagram (Stretch):** React Flow + ELK (layered, left to right) of the flow steps. Edges are solid when verified and dashed when inferred, and nodes are coloured by node kind.
- "Show in graph" calls `/graph?feature=:fid`.

### 3.5 Explorer + X-Ray panel
Route: `/p/:pid/explorer?node=<encodedId>&line=<n>`.

```
┌ Files ─────────────┬ src/lib/session.ts ─────────────────────┬ X-Ray ───────────────────────────┐
│ ▾ app              │ Outline: getCurrentUser · getSession    │ getCurrentUser          [function]│
│   ▸ (auth)       ● │ ─────────────────────────────────────── │ ● Authentication · core           │
│   ▸ (dashboard) ●● │  1 import { getServerSession } from …   │                                   │
│ ▾ lib              │  2 import { authOptions } from "@/lib…  │ What it does                      │
│   auth.ts        ● │  …                                      │ Looks up who is signed in and     │
│   session.ts     ● │ 12 export async function getCurrent…   ◀│ returns their user record, or     │
│   stripe.ts      ● │ 13   const session = await getServer…   │ nothing if no one is signed in.   │
│   db.ts          ● │ 14   return session?.user               │                                   │
│ ▸ components       │ 15 }                                    │ Where it sits                     │
│ ▸ prisma           │                                         │ Called before any dashboard page  │
│                    │                                         │ or API route that needs the user… │
│                    │                                         │                                   │
│                    │                                         │ Connections                       │
│                    │                                         │ ↑ Used by (14)   ↓ Uses (2)       │
│                    │                                         │ ↑ PAGE /dashboard        Resolved │
│                    │                                         │ ↑ sym:…#DashboardLayout  Resolved │
│                    │                                         │ ↓ sym:lib/auth.ts#authOptions AST │
│                    │                                         │                                   │
│                    │                                         │ Side effects                      │
│                    │                                         │ 🔑 Reads the auth session         │
│                    │                                         │                                   │
│                    │                                         │ If you change this                │
│                    │                                         │ 14 places in 3 features and 6     │
│                    │                                         │ routes depend on it. [Show graph] │
│                    │                                         │                                   │
│                    │                                         │ Health  ⚠ Hub: 14 dependants      │
│                    │                                         │ ▸ Details & provenance            │
└────────────────────┴─────────────────────────────────────────┴───────────────────────────────────┘
```

- **Tree** (`GET /tree`): directories collapse. Each file shows up to 3 feature colour dots, a flag count badge, and a muted role label on hover. Keyboard navigation works. Selecting a file sets `?node=file:…`.
- **Source** (`GET /nodes/:id/source`): highlighted client-side with **Shiki** (lazy-loaded, using only the languages present in the project). It is read-only, with line numbers, and a symbol **outline** strip comes from `SourceDTO.outline`. Clicking a symbol in the outline or the gutter selects it (`?node=sym:…&line=`). The selected symbol's range gets a tinted background. Files over 2,000 lines load in windows.
- **X-Ray panel** (`GET /nodes/:id` → `XRayDTO`). Its sections are in this order, and each one can be collapsed:
  1. **What it does**: `symbolPurpose` (for a symbol) or `summary.purpose`, followed by `details` behind "More".
  2. **Where it sits**: `summary.positionInApp`, plus feature chips (`features[]` with role).
  3. **Connections**: two tabs, **Used by (↑ upstream)** and **Uses (↓ downstream)**. Each row is a `NodeLink`, an edge kind label ("calls", "imports", "renders", "handles"…) and a `ProvenanceBadge`, grouped by edge kind and capped at 20 with "Show all".
  4. **Side effects**: `sideEffects[]` with an icon per kind (DB read/write, network, env, auth, email, payment…). Deterministic ones (those with a `target`) link to the target.
  5. **If you change this**: `impactPreview` in plain English: "N places in X features and Y routes depend on it." "Show in graph" opens `/graph?focus=<id>&depth=3`, and "Full list" expands `GET /nodes/:id/impact`.
  6. **Health flags**: `FlagBadge` list with titles. Clicking one goes to Health with that flag focused.
  7. **Details & provenance** (collapsed): signature, metrics (LOC, complexity, fan-in/out), node provenance and confidence, summary model and time.
- **Copy for AI (Stretch):** a button copies a markdown block with the node's ID, path:lines, purpose, callers and callees, side effects and flags, to paste into an AI assistant.
- No-AI mode: sections 1 and 2 show "Connect AI to get a plain-English explanation". Sections 3–7 still work.

### 3.6 Graph
Route: `/p/:pid/graph?level=&focus=&depth=&feature=&edgeKinds=&nodeKinds=&provenance=`.

- **Library:** Cytoscape.js with the `cytoscape-fcose` layout ([ADR-0006](decisions/0006-cytoscape.md)).
- **Levels** (segmented control):
  - **Features** (default when AI is done): one node per feature, sized by member count, with `feature_depends` edges weighted by edge count.
  - **Files** (MVP): file nodes inside **compound parent nodes**, one per feature (when grouped by feature) or per directory (toggle: "Group by feature / folder").
  - **Modules** (Stretch): directory nodes.
  - **Symbols** (Stretch, focus-only).
- **Interaction:**
  - Hovering a node shows a tooltip with its name, purpose and counts.
  - **Clicking a node selects it** and calls `GET /nodes/:id/impact?depth=3`. The graph then highlights **upstream** (amber) and **downstream** (teal), fades everything else to 15% opacity, and shows a side card (a compact X-Ray with "Open in Explorer").
  - Double-clicking a compound node collapses or expands it.
  - Clicking the background clears the selection.
- **Focus mode:** `focus=<id>&depth=n` fetches only the n-hop neighbourhood. A depth slider runs from 1 to 4.
- **Filters** (popover): edge kinds (default: imports, calls, renders, handles, reads, writes, calls_service), node kinds, feature (multi-select), and provenance (show or hide `heuristic` and `inferred`).
- **Node cap:** the server caps nodes at `limit` (default 400). When `truncated` is true, an overlay reads: "This view has 1,240 files — too many to read at once. Pick a feature or focus on a file." It offers feature chips and a find box. It never renders an unreadable hairball.
- **Styling:** file nodes are coloured by feature, with a red ring when the file has `high` flags. Edges are thin with 50% opacity, solid for `ast` and `resolved`, dashed for `heuristic` and dotted for `inferred`.
- A legend (bottom-left) explains the colours and line styles. A search box (top-left) finds a node and focuses it.

### 3.7 Cmd-K search palette
Global (any project route), opened by `⌘/Ctrl+K` or by clicking the top-bar field.

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 stripe webhook                                         │
├─────────────────────────────────────────────────────────┤
│ ✦ Ask: "stripe webhook"                          ↵ Ask   │  ← always first when query has ≥ 2 words or ends with "?"
│ FIND                                                     │
│   route  POST /api/webhooks/stripe                       │
│   file   app/api/webhooks/stripe/route.ts                │
│ SEARCH                                                   │
│   file   lib/stripe.ts — "Creates the Stripe client…"    │
│   sym    …#POST — «stripe» signature verification…       │
│ GO TO                                                    │
│   Features · Health · Settings                           │
└─────────────────────────────────────────────────────────┘
```

- **Find** calls `GET /find?q=` on every keystroke (debounced 80 ms; matches highlighted via `matchRanges`). **Search** calls `GET /search?q=` (debounced 200 ms; `snippet` with `«»` rendered as `<mark>`).
- The Ask row goes to `/p/:pid/ask?q=` and submits immediately. When the query is a single word, the Ask row moves below Find.
- Enter on a node opens the Explorer at that node. `⌘Enter` opens it in the Graph.

### 3.8 Ask
Route: `/p/:pid/ask?q=`. Data: `POST /ask` → an `AskEvent` stream.

- A chat layout with the question at the top. Below it, a **collapsed trace** ("Looked at 6 things ▸") lists the `thinking` and `tool` events ("Searched for 'webhook'", "Read app/api/webhooks/stripe/route.ts…"). The trace expands while streaming and collapses when `done` arrives.
- The answer streams from `token` events and is rendered as markdown. `[[nodeId]]` becomes a **CitationChip** (resolved against `AskAnswer.citations` on `done`; while streaming, the chip shows the raw ID label). Clicking a chip opens the X-Ray in a side sheet, without leaving Ask.
- `found: false` gets a distinct, neutral (not error-red) callout: **"Not found — here's what I checked"**, which lists `searched[]` as a checklist. It ends with "If it exists under another name, try: …".
- **Sources** footer: every citation as a `NodeLink` list.
- **Suggested questions** (empty state, generated client-side from the features and stack):
  - "Where is login handled?"
  - "What happens when a user pays?"
  - "Which API routes write to the database?"
  - "Do we have password reset?"
  - "What would break if I changed `<top hub>`?"
- Follow-ups send `history` (the last 6 turns). Ask history is Stretch (`GET /asks`).
- `AI_NOT_CONFIGURED` shows the `NoAIBanner` with "Connect AI".

### 3.9 Health
Route: `/p/:pid/health?rule=&severity=&feature=&flag=`. Data: `GET /health`.

- **Header sentence:** "3 things worth fixing soon and 11 to keep an eye on." Below it are severity tabs (All / High / Warn / Info) and a feature filter.
- **Flags grouped by rule** (collapsible sections, ordered by severity). Each section opens with a one-line, plain-English explanation of the rule (from [11](11-health-analysis.md)), e.g. "**Circular dependencies.** These files import each other in a loop, so changing one can break the others in surprising ways."
- **Flag row:** `FlagBadge`, title, a `NodeLink`, and key metric(s). Expanding it shows the `explanation` (AI, Stretch) and the evidence nodes.
- **Cycles** are rendered as path lists, `a.ts → b.ts → c.ts → a.ts`, where each segment is a `NodeLink`, plus a "Show in graph" (focus) button.
- **Metrics tab:** tables for top fan-in (hubs), top complexity and largest files, sortable. A feature coupling matrix as a heatmap is Stretch.
- `?flag=<id>` scrolls to and highlights that flag.

### 3.10 Settings
Route: `/settings` (global, not project-scoped). Data: `GET/PUT /api/settings`, `/providers/detect`, `/settings/test-provider`.

| Section | Controls |
|---|---|
| **AI provider** | Radio cards: **Claude Code CLI** (shown with "Detected v…" if found; "Billed to your Claude plan, no key needed"), **OpenRouter** (recommended: "one key, every model"), **Anthropic**, **OpenAI-compatible / Ollama** (`baseUrl` field; Ollama models offered when detected). A key field is shown for key-based providers: masked when set (`apiKeyMasked`), with "Replace" and "Remove". If a key comes from the environment: "Using OPENROUTER_API_KEY from environment". |
| **Models** | `fast` (summaries) and `smart` (features, overview, Ask) as text inputs with per-provider suggestions; defaults are in [07](07-llm-providers.md) |
| **Test connection** | A button that shows `ok` + latency + model, or the provider's error message |
| **Output language** | English / Türkçe (Stretch; changing it marks AI text stale and offers "Regenerate in Turkish") |
| **Budget** | USD per index run (empty = no cap) |
| **Concurrency** | 1–32 (default 6) |
| **Appearance** | Theme: System / Light / Dark (stored in localStorage) |
| **Privacy** | A static explainer: "Your code is sent only to the provider above. Catalyst has no server and no telemetry." with a link to [12](12-config-and-privacy.md) |

Saving calls `PUT /api/settings` (with the token). Keys are never echoed back.

### 3.11 Impact *(Stretch)*
Route: `/p/:pid/impact?base=`. Data: `POST /impact/diff`.

- Base selector: "Uncommitted changes" (default) or a text field for a ref (`main`).
- Sections:
  - **What you changed**: files with a status, plus changed symbols.
  - **What it affects**: features with changed/affected counts, affected routes, and a dependants list by distance.
  - **Flags touched**.
  - **Risk & what to test**: the `narrative` with citations.
- "Show in graph" highlights the changed nodes (purple) and the affected ones (amber).

## 4. Shared components

| Component | Props | Behaviour |
|---|---|---|
| `NodeLink` | `node: NodeRef`, `showPath?`, `showKind?` | Kind icon + display name in monospace (path muted). Click → Explorer `?node=`. Hover card → purpose + feature chips (lazy `GET /nodes/:id`) |
| `CitationChip` | `id: string`, `ref?: NodeRef` | Inline pill used inside AI markdown; unresolved IDs render as plain muted text (never a broken link) |
| `ProvenanceBadge` | `provenance`, `confidence?` | `AST` / `Resolved` / `Heuristic` / `AI-inferred`; tooltip explains the meaning; `AI-inferred` shows confidence % |
| `FlagBadge` | `severity`, `rule` | Severity dot + short rule label |
| `FeatureDot` / `FeatureChip` | `featureId`, `colorIndex` | Stable palette colour |
| `Markdown` | `text`, `citations?` | `react-markdown` + a remark plugin turning `[[id]]` into `CitationChip` |
| `EmptyState` | `title`, `body`, `action?` | Used for no data, no results and "not indexed" |
| `NoAIBanner` | `context: 'overview' \| 'features' \| 'ask' \| 'xray'` | "Connect an AI to get plain-English explanations. Catalyst still shows the structure." + [Connect AI] → Settings |
| `StatusPill` | `ProjectDTO` | Top bar status (§2) |
| `SseProgress` | `runId` | Stage list used by indexing (§3.2) |

## 5. State & data

### Routes

| Path | Screen |
|---|---|
| `/` | Launcher |
| `/settings` | Settings |
| `/p/:pid` | Redirects to `overview`, or to `indexing` if a run is active |
| `/p/:pid/indexing` | Indexing progress |
| `/p/:pid/overview` | Overview |
| `/p/:pid/features`, `/p/:pid/features/:fid` | Features |
| `/p/:pid/explorer?node=&line=` | Explorer + X-Ray |
| `/p/:pid/graph?level=&focus=&depth=&feature=&edgeKinds=&nodeKinds=&provenance=` | Graph |
| `/p/:pid/health?rule=&severity=&feature=&flag=` | Health |
| `/p/:pid/ask?q=` | Ask |
| `/p/:pid/impact?base=` | Impact (Stretch) |

Node IDs in query strings are `encodeURIComponent`-encoded. All view state that's worth sharing lives in the URL, so deep links work (the CLI prints them, e.g. `catalyst ask` results).

### TanStack Query keys

```ts
['projects']                               // GET /projects
['project', pid]                           // GET /projects/:pid        (refetchInterval 5s while status = indexing)
['settings'], ['providers-detect']
['overview', pid, lang]
['features', pid, lang], ['feature', pid, fid, lang]
['tree', pid]
['node', pid, nodeId, lang]                // XRayDTO
['source', pid, nodeId, start, end]
['impact', pid, nodeId, direction, depth]
['graph', pid, paramsHash]
['find', pid, q], ['search', pid, q, kind]
['health', pid, filtersHash]
['fs-browse', path]
```

- **Invalidation:** when an index run emits `done`, invalidate every key that starts with `pid`. `staleTime` is ∞ for project data, since it only changes on index, and 0 for `project`/`projects`.
- The `X-Catalyst-Index` response header is compared with `project.lastRunId`. If they differ, the `Stale` pill and a "New results available — refresh" toast appear.

### SSE hooks

```ts
useRunEvents(pid, runId): { events: ProgressEvent[]; last?: ProgressEvent; status: 'open' | 'done' | 'error' }
  // EventSource on GET /runs/:rid/events; auto-reconnect with Last-Event-ID; closes on done/error

useAsk(pid): { ask(question, history?): void; trace: AskEvent[]; text: string; answer?: AskAnswer; status; cancel() }
  // fetch POST /ask with X-Catalyst-Token; parse text/event-stream from ReadableStream (eventsource-parser); AbortController for cancel
```

### API client
`src/api/client.ts` is a typed `fetch` wrapper. It adds `X-Catalyst-Token` from `<meta name="catalyst-token">` (falling back to `sessionStorage`) to every non-GET request and to `/api/settings*`, and it parses responses with shared Zod schemas in dev (`import.meta.env.DEV`) to catch contract drift early. In dev, the Vite proxy forwards `/api` to `http://127.0.0.1:4321` (real server), or `dev:mock` serves the fixtures from `packages/web/mock/` (see [08 §1](08-api.md)).

## 6. i18n

- UI strings live in `src/i18n/en.ts` and `src/i18n/tr.ts` as flat key → string maps, used via a tiny `t(key, vars)` helper. **MVP:** all strings go through `t()` with only `en` filled in. **UI translation into Turkish is Later.**
- **AI output language** is separate from the UI language. It comes from `SettingsDTO.outputLanguage` (or `?lang=`) and is passed as `lang` on overview, features, nodes and Ask. Changing it does not translate the UI chrome. *(Stretch)*
- Identifiers, paths, node IDs and code are never translated.

## 7. States

| State | Where | Treatment |
|---|---|---|
| **Loading** | Any query | Skeletons that match the final layout (prose lines, list rows). No full-page spinners. The graph shows "Laying out…" during fcose |
| **Empty** | No features, no flags, no search results | `EmptyState` with a next step, e.g. Health with no flags: "No structural issues found. Nice." Search: "No matches. Try Ask instead →" |
| **Not indexed** | Project with `never-indexed` (`409 NOT_INDEXED`) | `EmptyState` + [Index now] → POST /index → /indexing |
| **Indexing** | Any project page while a run is active | Pages render whatever exists. The status pill shows progress, and the deterministic data appears as soon as its stage finishes |
| **Stale** | `status = stale` or the index header differs | Amber pill + a non-blocking toast "Code changed since last index — Re-index" |
| **No AI** | `aiStatus = skipped / none` or `AI_NOT_CONFIGURED` | `NoAIBanner` in place of AI-only content. Deterministic content is unaffected. The status pill reads "Structure only" |
| **Partial AI** | `aiStatus = partial` (budget hit / cancelled) | An info strip: "Explanations are incomplete (budget reached). [Continue]", which re-runs the index; the cache resumes it |
| **Error** | Failed queries | An inline error card with the `error.message` and [Retry]. `PROVIDER_ERROR` links to Settings → Test connection. Errors never blank the whole app |
| **Server gone** | `fetch` network failure | A full-width banner: "Catalyst isn't running. Start it again with `catalyst`." Requests are retried every 3 s |
