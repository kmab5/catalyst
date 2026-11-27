# ADR-0007: Health is flags plus changeability cards, not a single score

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
A single 'code health: 72/100' number is attractive in a demo but arbitrary, invites argument, and doesn't tell a vibe coder what to do.

## Decision
Report deterministic **flags** (rule, severity, evidence, plain-English title) and, per feature, an AI-written **changeability card** (add/change/remove ease as easy/moderate/hard, with reasons that cite metrics). No aggregate score.

## Consequences
- Every finding is actionable and verifiable.
- A score can be added later as a derived view if users ask for one.
