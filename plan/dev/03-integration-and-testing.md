# Phase 3 — Integration, End-to-End Testing & Demo Prep Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:systematic-debugging for every failure found here, and superpowers:verification-before-completion before claiming any task is done. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the two independently built halves into one working `catalyst` that meets the MVP success criteria on the golden repos, then prepare the demo.

**Architecture:** One agent on **one machine**, working on `main` after Sync S2. Agent A's real `core` + `server` replace Agent B's mock API, and the CLI is run as a user would run it. Failures are triaged into a fix list (I4) and fixed in severity order. No new features until the I3 checklist is green, apart from the Stretch work in I7.

**Tech Stack:** Everything from 00–02, plus Playwright (`@playwright/test`, Chromium) for one UI smoke test, and the `webapp-testing` skill for screenshots.

**Spec:** [`plan/docs/`](../docs/README.md). Acceptance comes from [01-vision §Success criteria](../docs/01-vision.md#success-criteria-hackathon-demo) and [test-repos.md §Expected results](../docs/test-repos.md#expected-results-checklist-taxonomy).

**Owner:** whichever agent finishes first (normally Agent A's machine, since it has an LLM key configured). The other person rehearses the demo and helps triage.

## Global Constraints

See [README §Global constraints](README.md#global-constraints).

## Review Focus

- **A real repo that neither agent tested on** (`next-supabase-stripe-starter`) must index without crashing and produce features. It is in I3 as a "cold" run.
- **The UI after a re-index while the page is open.** The stale toast must appear and a refresh must show the new data, with no blank screen. This is in I3 step 6.
- **No AI configured** (`env -u OPENROUTER_API_KEY -u ANTHROPIC_API_KEY`, `claude` not on PATH) must still give a usable structural UI with the NoAIBanner. This is in I3 step 7.
- **Running from a subfolder and through the launcher.** `catalyst` inside `taxonomy/app` must open the launcher with the suggestion, and opening `full-stack-fastapi-template/backend` from the launcher must work. This is in I3 step 5.
- **Port 4321 already in use** (a second `catalyst` running) must fall back to 4322 and print the actual URL. This is in I2 step 4.

---

### Task I1: Merge and build green on one machine

**Files:** none (merge only); fix files as needed.

- [ ] **Step 1: Bring both branches into `main`**

```bash
git checkout main && git pull
git merge origin/engine     # resolve: lockfile rule from README; shared conflicts → keep both additive changes
git merge origin/experience
```
Expected: the merge completes. If `packages/web` has its own `pnpm-lock.yaml` left over from B0, delete it (the root lockfile is the only one).

- [ ] **Step 2: Clean install, typecheck, tests**

Run: `rm -rf node_modules packages/*/node_modules && pnpm install && pnpm typecheck && pnpm test`
Expected: 0 type errors, all tests pass. A failing test here is a P0 fix (I4).

- [ ] **Step 3: Full build plus a check of the packaged CLI**

Run: `pnpm build && ls packages/cli/dist/web/index.html packages/cli/dist/grammars/*.wasm && node packages/cli/dist/index.js --version`
Expected: both paths exist; the version prints.

- [ ] **Step 4: Commit any merge fixes**

```bash
git add -A && git commit -m "chore: integrate engine + experience" && git push
```

---

### Task I2: Wire the real engine, server, UI and CLI on a fixture repo

**Files:**
- Create: `scripts/e2e-smoke.sh`
- Create: `packages/web/e2e/smoke.spec.ts`, `packages/web/playwright.config.ts`

- [ ] **Step 1: Structural run on the fixture repo**

Run: `node packages/cli/dist/index.js index --no-ai fixtures/repos/ts-basic --json | tee /tmp/run.json`
Expected: exit 0; `status: "done"`; the stats show files > 0 and edges > 0.

- [ ] **Step 2: Serve it, then check the API contract against the real server**

Write `scripts/e2e-smoke.sh`. It starts `node packages/cli/dist/index.js serve fixtures/repos/ts-basic --no-open --port 4400 &`, waits for `/api/health`, and then calls each MVP GET endpoint (`projects`, `projects/:pid`, `overview`, `features`, `tree`, `nodes/<encoded file:lib/session.ts>`, `nodes/…/source`, `nodes/…/impact`, `graph?level=file`, `find?q=sess`, `search?q=stripe`, `health`), checking for HTTP 200 and saving each body to `/tmp/e2e/*.json`. Then it runs `node --import tsx scripts/validate-dtos.ts /tmp/e2e`, which parses each body with its `@catalyst/shared` schema. Create that small script in this step.
Run: `bash scripts/e2e-smoke.sh`
Expected: every endpoint returns 200, and `validate-dtos` prints `ALL VALID`. Any schema failure is a P0 contract mismatch: fix it on the side that deviates from 05/08, never by loosening the schema.

- [ ] **Step 3: UI smoke test against the real server (Playwright)**

`smoke.spec.ts`: open `http://127.0.0.1:4400/`, pick `fixtures/repos/ts-basic` from recents, then assert each of these in turn: Overview renders the stack chip `Next.js`; Explorer `?node=file:lib/session.ts` shows the X-Ray panel; Graph renders a canvas with at least 1 node; Health lists the `cycle` flag for `a.ts`/`b.ts`; `Ctrl+K` + "session" lists `lib/session.ts`.
Run: `pnpm --filter @catalyst/web exec playwright install chromium && pnpm --filter @catalyst/web exec playwright test`
Expected: 1 passed.

- [ ] **Step 4: Port fallback**

Run: start a second `node packages/cli/dist/index.js serve fixtures/repos/ts-basic --no-open --port 4400` while the first is still running.
Expected: it prints `http://127.0.0.1:4401`, and both servers respond.

- [ ] **Step 5: Commit**

```bash
git add scripts packages/web/e2e packages/web/playwright.config.ts && git commit -m "test: e2e smoke (API contract + UI) against real server" && git push
```

---

### Task I3: End-to-end on the golden repos (with AI)

**Files:**
- Create: `plan/dev/e2e-results.md` (a filled-in checklist with timings and notes; this is the evidence for "done")

Prerequisite: a provider is configured (`catalyst config set provider.type openrouter` + `provider.apiKey`, or the `claude` CLI is logged in), and the testbeds are cloned per [test-repos.md](../docs/test-repos.md).

- [ ] **Step 1: Index `taxonomy` from its root and time it**

Run: `cd ../catalyst-testbeds/taxonomy && time node /path/to/catalyst/packages/cli/dist/index.js --no-open` (leave it running).
Expected: every stage reaches ✓ in **under 5 minutes** (success criterion 1), with no stage `degraded`. Record the stage timings and the token counts.

- [ ] **Step 2: Walk the success criteria in the browser**

Check and record each item from [01 §Success criteria](../docs/01-vision.md#success-criteria-hackathon-demo) items 2–6 and every box in [test-repos.md §Expected results](../docs/test-repos.md#expected-results-checklist-taxonomy). For each item, record ✓/✗ plus a one-line note in `e2e-results.md`. Spot-check 5 X-Ray "Connections" lists against the actual source with `grep -rn "<symbol>" ../catalyst-testbeds/taxonomy`: any invented edge is a P0.

- [ ] **Step 3: Ask through the CLI as well**

Run: `node …/index.js ask "Where do we handle Stripe webhooks?"` and `… ask "Do we have password reset?"`
Expected: the first cites the webhook route file; the second prints `Not found.` with at least 3 `Checked:` items.

- [ ] **Step 4: Python**

Run: in the UI, open the Launcher and choose `../catalyst-testbeds/full-stack-fastapi-template/backend`.
Expected: routes `route:GET /api/v1/items/`-style are detected; `db:sqlalchemy:*` (SQLModel) models are present; features include auth/users/items (success criterion 7).

- [ ] **Step 5: Both ways in**

Run: `cd ../catalyst-testbeds/taxonomy/app && node …/index.js`, then `node …/index.js ui` from `$HOME`.
Expected: both open the Launcher. The first suggests `taxonomy`. Picking a project opens it.

- [ ] **Step 6: Re-index while the page is open**

Edit one file in taxonomy (add a function to `lib/utils.ts`), then click Re-index in the status pill.
Expected: only `summarize` makes LLM calls (about 1–3), and the rest is cache hits. The stale toast or refresh shows the new function in the Explorer, with no blank screen.

- [ ] **Step 7: No-AI run**

Run: `env -u OPENROUTER_API_KEY -u ANTHROPIC_API_KEY -u OPENAI_API_KEY HOME=$(mktemp -d) PATH=<PATH without claude> node …/index.js ../catalyst-testbeds/next-supabase-stripe-starter`
Expected: the terminal prints the no-provider hint (09 §6). The UI shows the structure, the NoAIBanner on Overview, Features and Ask, and the Health page works.

- [ ] **Step 8: Cold run on the unseen repo with AI** (`next-supabase-stripe-starter`)

Expected: it completes; `db:supabase:*` and `svc:stripe` are present; at least 3 features.

- [ ] **Step 9: Commit the results**

```bash
git add plan/dev/e2e-results.md && git commit -m "test: e2e results on golden repos" && git push
```

---

### Task I4: Fix list (triage, then fix in order)

**Files:** `plan/dev/fix-list.md` (created here), plus whatever each fix touches.

- [ ] **Step 1: Write `fix-list.md`** from every ✗ in I1–I3, tagged:
  - **P0, demo-breaking:** a crash, a blank screen, an invented edge, a schema mismatch, a success criterion failing.
  - **P1, demo-visible:** wrong feature grouping, an ugly or empty state that's on the demo path, slow (> 5 min).
  - **P2, polish:** anything else.
- [ ] **Step 2: Fix the P0s and then the P1s**, one at a time. For each: reproduce it → write a failing test in the owning package (or add the case to `e2e-smoke.sh`) → fix it → `pnpm test` → commit `fix(<pkg>): <what>`. Use superpowers:systematic-debugging; don't guess.
- [ ] **Step 3: Re-run I2 (`e2e-smoke.sh` + Playwright) and the affected I3 steps.** Expected: green; update `e2e-results.md`.

Common fix recipes (check these first):

| Symptom | Likely cause | Where |
|---|---|---|
| Features empty / all `feature:shared` | features prompt over budget, or every ID got dropped | `core/ai/stages/features.ts`: log the dropped IDs, check the allowed-ID list format |
| X-Ray "Connections" empty for alias imports | tsconfig `paths` not resolved (`extends`, `baseUrl`) | `core/resolve/ts.ts` |
| Graph freezes | node cap not applied, or fcose on more than 400 nodes | `query.graph` limit / `web` Graph level fallback |
| 401 on POST from the UI | token meta not injected (served HTML not rewritten) | `server` static handler |
| Grammar load error after `pnpm build` | wasm not copied, or a `grammarsDir` mismatch | `cli` build script / `createEngine({ grammarsDir })` |
| Ask never ends | missing `done` event on a provider error / timeout | `core/ai/ask` |

---

### Task I5: Performance and demo-safety pass

- [ ] **Step 1:** If taxonomy's first index took ≥ 5 min, raise `concurrency` to 8 (`catalyst config set concurrency 8`) and re-measure. If it's still slow, check that `summarize` skips tests, barrels and tiny files (06 §5.1).
- [ ] **Step 2:** Confirm that a warm re-run (no changes) makes **0 LLM calls** and finishes in under 10 s: `catalyst index ../catalyst-testbeds/taxonomy --json | jq '.stats.llmCalls'` → `0`.
- [ ] **Step 3:** Commit any config default changes: `git commit -am "perf: tune defaults for demo" && git push`.

---

### Task I6: Demo preparation

**Files:**
- Create: `README.md` at the repo root (quickstart: `npx catalyst-dx` / `pnpm build && node packages/cli/dist/index.js`, provider setup, screenshots, a link to `plan/docs`)
- Create: `demo/screenshots/*.png` (via the webapp-testing skill / Playwright), `demo/script.md`

- [ ] **Step 1:** Pre-index `taxonomy` and `full-stack-fastapi-template/backend` with AI (warm caches). Do **not** delete their `.catalyst/` directories afterwards.
- [ ] **Step 2:** Write `demo/script.md` from [02 §Demo script](../docs/02-users-and-use-cases.md#demo-script-hackathon-4-minutes), with the exact clicks, the exact Ask questions, and the node to X-Ray (use the real session helper path found in I3).
- [ ] **Step 3:** Capture screenshots of Overview, a Feature, the X-Ray, the Graph blast radius, an Ask answer (found and not-found) and Health, as a **fallback if live demo fails**.
- [ ] **Step 4:** Write the root `README.md` with the quickstart and the screenshots.
- [ ] **Step 5:** Rehearse the full script twice against the live app. Any stumble becomes a P0/P1 in `fix-list.md`.
- [ ] **Step 6:** Commit: `git add README.md demo && git commit -m "docs: README quickstart + demo script + screenshots" && git push`

---

### Task I7: Stretch (only once I3 is all ✓ and before the 16:50 freeze)

Merge or finish whatever Stretch work the agents completed, in this order ([13 §1](../docs/13-roadmap.md#stretch-today-in-this-order-if-the-mvp-is-done)). After each item, re-run `e2e-smoke.sh` and commit:

1. **MCP:** `claude mcp add catalyst -- node /abs/packages/cli/dist/index.js mcp /abs/taxonomy`. Then in Claude Code, ask "use catalyst to get the blast radius of the session helper". Expected: a `get_blast_radius` call returns an ImpactDTO. Add it to the demo close.
2. **Diff impact:** `catalyst impact` on taxonomy with an uncommitted change → the affected features and routes are listed.
3. **Turkish:** `catalyst config set outputLanguage tr` → re-index → the Overview text is in Turkish while the identifiers stay unchanged.
4. Cost estimate dialog → flow diagram → Tier 3 → extra health rules → Copy for AI → Go Tier 2.

### Task I8: Code freeze (16:50)

- [ ] `git tag demo-v1 && git push --tags`. After this, only P0 fixes go in, each one committed and tagged `demo-v1.x`.
