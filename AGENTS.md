# Catalyst
Catalyst indexes local projects and explains code through a graph of dependencies, features and health findings.
Its HTTP API supplies the web UI and the CLI opens the local engine.
See the [specification](plan/docs/README.md) and [development plan](plan/dev/README.md).

| Owner | Packages |
|---|---|
| A | shared (contract: commits only), core, server |
| B | web, cli |

Run `pnpm test` and `pnpm typecheck`. For lockfile conflicts, use the [workspace procedure](plan/dev/README.md#git-workflow).

## Global constraints

Every task in every plan implicitly includes these (values copied from the spec):

- **Runtime:** Node **≥ 22**, ESM only (`"type": "module"`), TypeScript strict, pnpm 9 workspaces.
- **Package names:** `@catalyst/shared`, `@catalyst/core`, `@catalyst/server`, `@catalyst/web`; the published package is **`catalyst-dx`** (dir `packages/cli`) with the bin **`catalyst`**.
- **Dependency rules ([04 §2](plan/docs/04-architecture.md#package-dependency-rules)):** `web` imports only `@catalyst/shared` (never `core`); `core` never imports `server`/`web`/`cli`; `shared` depends only on `zod`.
- **IDs:** always build and parse them with `ids.*` from `@catalyst/shared`, never by hand. Paths inside IDs and the DB are **repo-relative POSIX** (`src/lib/a.ts`), even on Windows/WSL.
- **Schemas:** every API payload is a schema from `@catalyst/shared`. The server validates its input, and the web client validates responses in dev.
- **Server:** default port **4321** (falls back to the next free port up to +20), binds **`127.0.0.1`**, and requires the per-launch token in `X-Catalyst-Token` for all non-GET requests and all `/api/settings*` requests.
- **Storage:** project DB at `<root>/.catalyst/catalyst.db`; global config at `~/.catalyst/config.json` (mode 0600) and `~/.catalyst/projects.json`.
- **Privacy:** no telemetry; no network code except the LLM adapters; never read `.env`/`.env.*` contents (except the **names** in `.env.example`/`.env.sample`); redact secrets before any prompt ([12 §5](plan/docs/12-config-and-privacy.md#5-privacy-guarantees)); never log keys or code.
- **Providers:** `openrouter` (recommended default), `anthropic`, `openai-compatible` (also Ollama/LM Studio) and `claude-code`, behind `LLMProvider` ([07 §2](plan/docs/07-llm-providers.md#2-interface-coreaiproviderstypests)). Default models: `fast` = `claude-haiku-5-5`, `smart` = `claude-sonnet-5-5` (Anthropic IDs; both OpenRouter tiers use `openrouter/free`).
- **AI grounding:** every node ID in LLM output is validated against the store, unknown IDs are dropped, and AI-written text cites as `[[nodeId]]`.
- **Copy:** plain English, non-judgmental ("worth a look", never "bad code"). There is no 0–100 health score anywhere.
- **Tests:** Vitest, co-located `*.test.ts`. LLM-dependent code is tested with `FakeProvider` (A15); **no test calls a real LLM or the network**.
- **Golden repos** live in `../catalyst-testbeds/` (outside the repo): see [test-repos.md](plan/docs/test-repos.md).
