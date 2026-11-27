# 13 — Roadmap & Cut Lines

## 1. Priority map

### MVP (hackathon, today; deadline 17:00)
- Engine: scanner, Tier 1 TS/JS + Python parsing, import and call resolution, the core detectors (Next.js/Express/FastAPI/Flask routes, Prisma/Supabase/SQLAlchemy/SQLModel, env vars, services, React components), graph algorithms, the core health flags (cycle, god-file, god-function, hub, unused-export), and re-runs that use the hash cache.
- AI: provider abstraction with OpenRouter, Anthropic, OpenAI-compatible and Claude Code CLI; file summaries, rollups, features + flows, overview, changeability cards; Ask (tool loop, plus a single-shot fallback).
- Interfaces: `catalyst [path]`, `catalyst ui`, `catalyst index`, `catalyst ask`, `catalyst config`; the project-scoped HTTP API + SSE.
- UI: Launcher, indexing progress, Overview, Features, Explorer + X-Ray, Graph (file + feature levels, blast radius), Cmd-K Find/Search, Ask, Health, Settings.

### Stretch (today, in this order, if the MVP is done)
1. **MCP server** (`catalyst mcp`). Small effort that strongly supports the "helps devs" story.
2. **Diff impact** (`catalyst impact`, plus the Impact screen).
3. **Turkish output** (`outputLanguage: tr`).
4. **Cost estimate dialog + budget cap.**
5. **Flow diagrams** (React Flow + ELK).
6. **Tier 3 LLM extraction** for unsupported files.
7. Extra health rules: single-impl-interface, pass-through-wrapper, cross-feature-coupling, missing-auth-on-mutating-route.
8. "Copy for AI" context blocks; Ask history.
9. Tier 2 for Go (shown on the RealWorld Gin app).

### Later (post-hackathon)
- **Watch mode** (chokidar plus the incremental pipeline, pushing updates to the UI over SSE).
- Tier 2 for all tags-query languages; type-precise TS resolution (TypeScript compiler API / `scip-typescript`) as an optional "precise mode".
- Git intelligence: churn hotspots, co-change coupling, ownership, "risky files" (churn × complexity × fan-in).
- More detectors: Drizzle, Mongoose, Django, tRPC, GraphQL resolvers, NestJS, server actions, queues/cron.
- Embedding search (local transformers.js model) alongside FTS.
- **VS Code extension** as a thin client over the HTTP API: CodeLens "used by N, part of Billing", a hover X-Ray, and "open in Catalyst".
- UI translation (`tr`) and more output languages.
- **Hosted version:** `GitRepoSource` (clone by URL), GitHub App/OAuth (Composio or a native GitHub App), multi-tenant storage, shareable architecture pages. The project-scoped API and the `Source` interface are the seams that make this possible.
- Exportable docs: generate `ARCHITECTURE.md` and per-feature markdown into the repo, plus a PR comment bot for diff impact.

## 2. Cut lines (if time runs short, cut from the top)

1. Graph view polish (keep a basic Cytoscape render with blast-radius highlighting).
2. Module rollups (feature discovery can work from file summaries plus the directory tree).
3. Changeability cards (keep the deterministic coupling numbers on the feature page).
4. Python support (keep TS/JS; the demo becomes TS-only).
5. The Launcher's directory browser (keep a plain path text input).

**Never cut:** Overview, Features, X-Ray, Ask. These are the demo.

## 3. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM latency makes first indexing slow during the live demo | Pre-index the demo repo (the cache is warm). Show a live re-index of one edited file. Concurrency 6–8. |
| The LLM returns invalid IDs or bad JSON | Zod validation, an ID allow-list in each prompt, one repair retry, then drop the item (see [07 §8](07-llm-providers.md)). |
| web-tree-sitter grammar/WASM version mismatch | Pin `web-tree-sitter` together with the grammar packages, and smoke-test grammar loading in CI on day one. |
| better-sqlite3 has no prebuilt binary for the user's Node | Require Node ≥ 22 LTS. Fallback: `node:sqlite` (behind a `Store` interface, Later). |
| Two devs drift apart on the contract | `packages/shared` + the fixture + contract tests; `contract:` commits; mock mode in the server. |
| Feature discovery is poor on large repos | Batch by top-level directory/community, then merge in a second smart-model pass (see [06 §5.4](06-analysis-pipeline.md)). |
