# ADR-0002: Parse with web-tree-sitter (WASM), not compiler APIs

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
We need fast, multi-language parsing that works on messy, often half-broken vibe-coded repos with no installed node_modules, on Windows, macOS and Linux via npx. Type-precise options (the TypeScript compiler API, scip-typescript, scip-python, pyright) are slow, need working project configs and dependencies, and are different per language.

## Decision
Use `web-tree-sitter` with prebuilt grammar `.wasm` files (typescript, tsx, javascript, python; later go, rust, java, ruby, c_sharp, php) for all parsing. Resolve imports with our own resolvers (tsconfig paths, Python package roots). Resolve calls via local scope → import bindings → a unique-name heuristic, and record the provenance on every edge.

## Consequences
- No native compilation and no dependency on the repo's own toolchain.
- One parsing model across all tiers.
- Call resolution is approximate for dynamic dispatch, method calls on inferred types, and re-exports through barrels. We show this honestly through provenance badges.
- A type-precise 'precise mode' is possible later as an optional adapter (see the roadmap).
