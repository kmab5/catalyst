# ADR-0004: AI is core, but always grounded in the deterministic graph

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
The product's main value (the big picture, features, plain-English explanations, 'is X implemented?') cannot come from static analysis alone. Pure LLM approaches (dumping code into a prompt, or vector RAG) produce plausible but wrong architecture claims, and users can't verify them.

## Decision
AI is the default and expected path: without AI the product is much weaker, but it still runs in structural-only mode. The LLM never creates structural edges silently. It receives graph facts, detector anchors and an allow-list of node IDs, and returns structured output (Zod) whose IDs are validated against the store. Anything the LLM asserts that the graph can't confirm is stored with `provenance: inferred` and shown with an AI-inferred badge. Flow steps get `edgeVerified` from a real graph path check.

## Consequences
- Explanations are checkable and clickable, which builds trust with developers.
- Requires careful context assembly and validation code (see 06 §5).
- Structural-only mode comes almost free, but it is not polished.
