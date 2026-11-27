# Catalyst — Product Documentation

Catalyst is a local-first developer-experience tool. You run it in (or point it at) a codebase. It parses the code into a graph, uses an LLM grounded on that graph to work out what every part does, and serves a local web UI. The UI explains the app in plain English: its features, how they connect, what breaks if you change something, and where something is (or is not) implemented.

This folder is the **full product specification**. Every feature is labelled with a priority:

| Label | Meaning |
|---|---|
| **MVP** | Must work in the hackathon demo (built today). |
| **Stretch** | Build it today if MVP is done; the design is fully specified so it can be picked up at any point. |
| **Later** | Post-hackathon. Specified enough that today's architecture does not block it. |

The dev plan (task breakdown, timeline, who-builds-what) lives in `plan/dev/` and is written *from* these docs.

## Reading order

| # | Doc | What it answers |
|---|---|---|
| 01 | [Vision](01-vision.md) | Why Catalyst exists, principles, non-goals, success criteria |
| 02 | [Users & use cases](02-users-and-use-cases.md) | Who it is for, the questions they ask, the demo script |
| 03 | [Features](03-features.md) | The full feature catalog with MVP/Stretch/Later and acceptance criteria |
| 04 | [Architecture](04-architecture.md) | Packages, modules, runtime topology, ownership boundaries |
| 05 | [Data model](05-data-model.md) | Node/edge kinds, IDs, SQLite schema, shared Zod schemas |
| 06 | [Analysis pipeline](06-analysis-pipeline.md) | Scanning, parsing, resolution, detectors, LLM stages, caching |
| 07 | [LLM providers](07-llm-providers.md) | Provider interface, adapters, model tiers, cost control, prompts |
| 08 | [API](08-api.md) | HTTP + SSE endpoints and the MCP server tools |
| 09 | [CLI](09-cli.md) | Commands, flags, behaviours |
| 10 | [Web UI](10-web-ui.md) | Screens, layout, interactions, states |
| 11 | [Health analysis](11-health-analysis.md) | Metrics, flag rules, thresholds, changeability cards |
| 12 | [Config & privacy](12-config-and-privacy.md) | Config files, ignore rules, secrets, what leaves the machine |
| 13 | [Roadmap](13-roadmap.md) | Priority map, cut lines, post-hackathon direction |
| — | [Glossary](GLOSSARY.md) | Shared vocabulary (use these words in code and UI) |
| — | [Decisions](decisions/) | ADRs for every major choice |
| — | [Test repos](test-repos.md) | Golden repos used for testing and the demo |

## Context

- **Event:** hackathon, theme "solving/helping a dev's issues". Deadline 17:00 local time on 2026-11-27. The judged deliverable is a working product.
- **Team:** two developers working in parallel on separate machines, with coding agents as the main way code gets written. The architecture is split along a contract (`packages/shared`) so the two halves can be built independently. See [04-architecture.md §Ownership](04-architecture.md#ownership--parallel-work).
- **License:** open source (MIT).
