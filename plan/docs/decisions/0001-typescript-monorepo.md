# ADR-0001: TypeScript/Node pnpm monorepo, published as `catalyst-dx`

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
Two developers, a ~4 hour hackathon, coding agents writing most of the code. The tool needs a CLI, a local HTTP server, a React UI, an MCP server and an LLM pipeline. v1 users (JS/Python devs) almost always have Node installed.

## Decision
Write everything in TypeScript (Node ≥ 22, ESM) as a pnpm workspace: `shared`, `core`, `server`, `web`, `cli`. Publish only `catalyst-dx` (bin `catalyst`). The names `catalyst` and `catalyst-cli` are already taken on npm. `cli` bundles the other packages and the built web UI.

## Consequences
- One language across the engine, UI, schemas and LLM structured output (Zod everywhere).
- `npx catalyst-dx` works with no install step.
- CPU-heavy parsing is slower than it would be in Rust/Go. That is acceptable at the target repo sizes and can move to worker threads later.
- Users without Node must install it (documented).
