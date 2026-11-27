# ADR-0008: SQLite FTS5 over summaries instead of vector embeddings (for now)

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
'Where is X?' search needs to match intent ('stripe webhook') to code that uses other words (`handlePaymentEvent`). Embeddings need an embedding provider (Anthropic has none) or a local model download, plus a vector index.

## Decision
Index names, paths, AI summaries, tags and code snippets in FTS5 (porter stemming). The AI-written tags and summaries bridge the vocabulary gap. Ask handles anything fuzzier using graph tools.

## Consequences
- No extra provider or downloads; search works the moment summaries exist.
- Weaker for purely conceptual queries in structural-only mode. Local embeddings (transformers.js) are Later.
