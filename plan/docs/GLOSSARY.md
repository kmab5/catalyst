# Glossary

Use these exact terms in code (type and module names), in the UI, and in prompts.

| Term | Meaning | Avoid |
|---|---|---|
| **Project** | A codebase opened in Catalyst, identified by its absolute root path. Has its own `.catalyst/` store. | repo (except for git-specific things), workspace |
| **Source** | Where a project's files come from (`LocalPathSource`; `GitRepoSource` later). | provider (reserved for LLMs) |
| **Index / Indexing run** | The full pipeline that builds a project's store. One execution is an `IndexRun`. | scan (that is one stage), build |
| **Stage** | One step of an indexing run (`scan`, `parse`, …, `fts`). | phase, step |
| **Node** | Anything in the graph: directory, file, symbol, route, db_model, env_var, package, service, feature. | entity, vertex |
| **Symbol** | A named definition inside a file (function, class, method, component, hook, type, …). | block |
| **Edge** | A typed, directed relationship between two nodes (`imports`, `calls`, `writes`, …). | link, relation |
| **Provenance** | How an edge or node was obtained: `ast`, `resolved`, `heuristic`, `inferred`. | source |
| **Tier** | Depth of language support: 1 = deep (TS/JS, Python), 2 = structural (tags), 3 = LLM-extracted. | level |
| **Detector** | Deterministic code that recognises framework or library patterns and adds route/db/env/service nodes and edges. | plugin, analyzer |
| **Anchor** | A detector fact used to ground feature discovery (e.g. "uses next-auth → auth"). | hint |
| **Summary** | The AI-written structured description of a file, module or symbol. | doc, description |
| **Rollup** | A module (directory) summary built from its children's summaries. | aggregate |
| **Feature** | An AI-discovered user-facing or technical capability (Authentication, Billing…) with members, entry points and flows. | domain, module, component |
| **Entry point** | Where execution starts from the outside: a route, page, CLI command, cron job, or event handler. | trigger (a flow has a trigger, which is the human description) |
| **Flow** | An ordered list of steps through a feature, from trigger to effect. | path, journey |
| **X-Ray** | The panel that explains one node: what it does, where it sits, its connections, side effects, its impact, its flags. | inspector, details |
| **Blast radius / Impact** | Everything upstream that could break if a node changes (plus downstream dependencies). "Impact" is also the diff-based version. | ripple |
| **Upstream / Downstream** | Upstream = dependants (callers, importers). Downstream = dependencies (callees, imports). | parents/children |
| **Flag** | A deterministic health finding with a rule, severity and evidence. | issue, warning, lint |
| **Changeability card** | The per-feature, AI-written assessment of how easy the feature is to add to, change or remove, citing metrics. | score |
| **Find / Search / Ask** | The three search layers: name fuzzy match / full-text over code and summaries / agentic Q&A. | query |
| **Citation** | An inline `[[nodeId]]` reference in AI-written text, rendered as a clickable chip. | link |
| **Structural-only mode** | Running without an AI provider: graph, search over code, flags; no summaries or features. | offline mode |
| **Fast / Smart model** | The two model tiers: cheap/fast for per-file work, strong for synthesis and Ask. | small/large |
