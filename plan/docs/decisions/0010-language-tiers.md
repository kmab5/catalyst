# ADR-0010: Three tiers of language support with provenance

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
Users want Catalyst to work on 'any codebase', but deep, correct analysis per language is expensive. Shallow analysis presented as precise would break the 'facts, not guesses' promise.

## Decision
Tier 1 (deep: TS/JS, Python), with real import resolution and framework detectors. Tier 2 (structural: tree-sitter tags queries, name-matched edges) for other grammars. Tier 3 (LLM-extracted symbols and edges) for everything else, including SQL, YAML and config. Each node and edge records its provenance and confidence, and the UI shows it.

## Consequences
- 'Supports anything' is true, with honest precision labels.
- Tier 2 and Tier 3 graphs have false and missing edges, so blast radius on them is labelled approximate.
