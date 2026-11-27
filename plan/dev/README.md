# Catalyst — Development Plan (to the hackathon MVP + demo)

This folder turns the spec in [`plan/docs/`](../docs/README.md) into executable plans for **two coding agents working in parallel on two machines**, followed by **one integration/testing pass on a single machine**.

| Plan | Who | Machine | What |
|---|---|---|---|
| [00-foundation.md](00-foundation.md) | **Agent A** | A | Monorepo + the `@catalyst/shared` contract + typed `core`/`server` stubs → tag `contract-v1` |
| [01-agent-a-engine.md](01-agent-a-engine.md) | **Agent A** | A | `core` (scan, parse, resolve, detect, graph, health, AI stages, Ask, query layer) + `server` (HTTP/SSE) |
| [02-agent-b-experience.md](02-agent-b-experience.md) | **Agent B** | B | `web` (every screen, against a mock API built from a fixture) + `cli` (commands, packaging) |
| [03-integration-and-testing.md](03-integration-and-testing.md) | **One agent** (either) | one | Merge, wire real engine ↔ UI ↔ CLI, end-to-end on the golden repos, fix list, demo prep, Stretch |

## Timeline (today, 2026-11-27, deadline 17:00)

| Time | Agent A (machine A) | Agent B (machine B) |
|---|---|---|
| 13:30–14:05 | **Phase 0**: F1–F3, push + tag `contract-v1` | **B0**: web scaffold, shell, design tokens (needs no contract); clone the testbeds |
| 14:05–15:15 | A1–A10: store, settings, scan, parse, resolve, detect | B1–B6: fixture, mock API + client, components, Launcher/Settings, Indexing, Overview |
| **15:15 · Sync S1** | Merge `engine` → `main` (structural engine + server, with A11–A13 if done) | Merge `experience` → `main` (UI on mocks) |
| 15:15–16:15 | A11–A19: graph/health, query, server, AI stages, Ask | B7–B13: Features, Explorer/X-Ray, Graph, Cmd-K/Ask, Health, CLI, packaging |
| **16:15 · Sync S2** | Final merge of `engine` | Final merge of `experience` |
| 16:15–16:50 | **Integration** ([03](03-integration-and-testing.md)) on ONE machine: wire, E2E, fixes, pre-index the demo repo | The other person rehearses the demo script ([02-users §Demo](../docs/02-users-and-use-cases.md#demo-script-hackathon-4-minutes)) and helps triage |
| 16:50 | Code freeze. Only demo-breaking fixes after this point |
| 17:00 | Demo |

The times are targets, not stop orders. If a track runs late, follow the **cut lines** in [13 §2](../docs/13-roadmap.md#2-cut-lines-if-time-runs-short-cut-from-the-top). Each plan's tasks are ordered so that anything still unfinished at a sync point is the least important part.

## Git workflow

- Remote: `origin` (`github.com/kmab5/catalyst`). Agent A works on branch **`engine`**, Agent B on branch **`experience`**. Both branch from `main` once it has `contract-v1`.
- **Ownership = no conflicts.** A touches only `packages/{shared,core,server}` and `fixtures/repos/`. B touches only `packages/{web,cli}` and `fixtures/index/`. Root files (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`) are frozen after F1. If a change there is truly needed, make it as a single-purpose commit announced to the other agent.
- **`packages/shared` changes** after `contract-v1`: only as a `contract:` commit that is **pushed straight to `main`** (`git checkout main && git pull && <edit> && commit && push`). The other agent then runs `git merge main`. Changes must be additive (new optional fields or new schemas). Never rename or remove anything.
- **Lockfile:** on a `pnpm-lock.yaml` merge conflict, run `git checkout --theirs pnpm-lock.yaml && pnpm install && git add pnpm-lock.yaml`. Never hand-edit it.
- **At a sync point**, each agent runs `git fetch && git merge origin/main`, runs `pnpm install && pnpm test && pnpm typecheck` (all green), then `git checkout main && git merge <branch> && git push`, and finally merges `main` back into its own branch.
- Commit early and often with conventional prefixes: `feat(core):`, `feat(web):`, `fix(server):`, `test(core):`, `contract:`, `chore:`.

## Global constraints

Every task in every plan implicitly includes these (values copied from the spec):

- **Runtime:** Node **≥ 22**, ESM only (`"type": "module"`), TypeScript strict, pnpm 9 workspaces.
- **Package names:** `@catalyst/shared`, `@catalyst/core`, `@catalyst/server`, `@catalyst/web`; the published package is **`catalyst-dx`** (dir `packages/cli`) with the bin **`catalyst`**.
- **Dependency rules ([04 §2](../docs/04-architecture.md#package-dependency-rules)):** `web` imports only `@catalyst/shared` (never `core`); `core` never imports `server`/`web`/`cli`; `shared` depends only on `zod`.
- **IDs:** always build and parse them with `ids.*` from `@catalyst/shared`, never by hand. Paths inside IDs and the DB are **repo-relative POSIX** (`src/lib/a.ts`), even on Windows/WSL.
- **Schemas:** every API payload is a schema from `@catalyst/shared`. The server validates its input, and the web client validates responses in dev.
- **Server:** default port **4321** (falls back to the next free port up to +20), binds **`127.0.0.1`**, and requires the per-launch token in `X-Catalyst-Token` for all non-GET requests and all `/api/settings*` requests.
- **Storage:** project DB at `<root>/.catalyst/catalyst.db`; global config at `~/.catalyst/config.json` (mode 0600) and `~/.catalyst/projects.json`.
- **Privacy:** no telemetry; no network code except the LLM adapters; never read `.env`/`.env.*` contents (except the **names** in `.env.example`/`.env.sample`); redact secrets before any prompt ([12 §5](../docs/12-config-and-privacy.md#5-privacy-guarantees)); never log keys or code.
- **Providers:** `openrouter` (recommended default), `anthropic`, `openai-compatible` (also Ollama/LM Studio) and `claude-code`, behind `LLMProvider` ([07 §2](../docs/07-llm-providers.md#2-interface-coreaiproviderstypests)). Default models: `fast` = `claude-haiku-5-5`, `smart` = `claude-sonnet-5-5` (Anthropic IDs; OpenRouter slugs `anthropic/claude-haiku-5.5`, `anthropic/claude-sonnet-5.5`; verify the slugs at build time).
- **AI grounding:** every node ID in LLM output is validated against the store, unknown IDs are dropped, and AI-written text cites as `[[nodeId]]`.
- **Copy:** plain English, non-judgmental ("worth a look", never "bad code"). There is no 0–100 health score anywhere.
- **Tests:** Vitest, co-located `*.test.ts`. LLM-dependent code is tested with `FakeProvider` (A15); **no test calls a real LLM or the network**.
- **Golden repos** live in `../catalyst-testbeds/` (outside the repo): see [test-repos.md](../docs/test-repos.md).

## Definition of done (MVP)

The success criteria in [01-vision §Success criteria](../docs/01-vision.md#success-criteria-hackathon-demo), verified in [03](03-integration-and-testing.md) on `taxonomy` and on `full-stack-fastapi-template/backend`.

## How to run each agent

Each person starts a fresh Claude Code session in their clone of the repo and pastes the matching kickoff prompt.

**Agent A (machine A):**
```
You are Agent A ("Engine") for Catalyst. Read plan/dev/README.md, then plan/docs/README.md and the docs each task links to.
Execute plan/dev/00-foundation.md completely (push + tag contract-v1), then create branch `engine` and execute
plan/dev/01-agent-a-engine.md task by task, using superpowers:executing-plans (TDD, commit per task).
Only touch packages/shared (contract: commits to main), packages/core, packages/server and fixtures/repos.
At the sync points in plan/dev/README.md, merge as described. Do not stop to ask unless blocked on a decision only a human can make.
```

**Agent B (machine B):**
```
You are Agent B ("Experience") for Catalyst. Read plan/dev/README.md, then plan/docs/README.md and the docs each task links to.
Create branch `experience`. Execute plan/dev/02-agent-b-experience.md task by task, using superpowers:executing-plans (TDD, commit per task).
Start with B0 immediately; before B1, `git merge origin/main` once Agent A has pushed tag contract-v1 (poll `git fetch --tags` every few minutes).
Only touch packages/web, packages/cli and fixtures/index. At the sync points in plan/dev/README.md, merge as described.
Use the frontend-design skill for visual work. Do not stop to ask unless blocked on a decision only a human can make.
```

**Integration agent (one machine, after S2):**
```
You are the integration agent for Catalyst. Read plan/dev/README.md and execute plan/dev/03-integration-and-testing.md on main.
```
