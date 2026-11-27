# ADR-0003: One SQLite DB per project via better-sqlite3

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
We need a local, zero-config store for the graph, summaries, caches and full-text search that survives restarts and supports incremental updates.

## Decision
Use `better-sqlite3` (synchronous, fast, prebuilt binaries for common platforms, FTS5 compiled in), with one DB at `<project>/.catalyst/catalyst.db` in WAL mode. Hold the graph in memory with graphology, rebuilt from SQLite on load. All SQL lives in repository classes behind a `Store` interface.

## Consequences
- Simple, fast, inspectable with any SQLite tool.
- A native module, but it comes with prebuilt binaries. If install fails, the fallback is `node:sqlite` behind the same `Store` interface (Later).
- The DB is not committed (`.catalyst/` goes in .gitignore).
