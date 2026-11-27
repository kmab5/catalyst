# ADR-0009: Project-scoped API and a Source abstraction

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
Catalyst must work both from a repo root (`catalyst`) and from a UI launcher that opens any folder. A hosted version that analyses GitHub repos is a long-term possibility.

## Decision
One server can have several projects open, and every endpoint is under `/api/projects/:pid/…`. Projects are created from a `Source` (`LocalPathSource` now, `GitRepoSource` later). The UI is a full control surface: everything the CLI can do, the UI can do.

## Consequences
- Running from the root and from the launcher are the same code path.
- A hosted version only needs a new Source, auth and multi-tenant storage. The API shape doesn't change.
