# 01 — Vision

## The problem

AI coding assistants make writing code fast, but they leave developers with **comprehension debt**:

1. **Lost position.** People no longer know *where* a function, file or component sits in the overall app, or what it is for.
2. **Invisible blast radius.** People cannot see what depends on a piece of code, so they cannot predict what breaks when it changes.
3. **Hidden wiring.** Auth, the database, payments, external APIs, env config and UI are connected in ways nobody wrote down.
4. **Silent structural decay.** Circular dependencies, god files, needless abstractions and fragile hubs pile up unnoticed.
5. **Stale docs.** Hand-written architecture docs are out of date by the next commit.

There are two groups of people with this problem:

- **Vibe coders** built an app with AI and do not fully understand it. They ask: *"Where is login handled?"*, *"What does this file do?"*, *"Do I even have password reset?"*, *"If I delete this, what breaks?"*
- **Developers** are onboarding onto, auditing or refactoring an unfamiliar repo. They ask: *"What is the blast radius of changing `getSession`?"*, *"How coupled is billing to auth?"*, *"How hard would it be to remove the posts feature?"*, *"Which routes write to the DB without an auth check?"*

## The solution

Catalyst is a CLI that you run in a repo root (or point at any folder from its UI). It:

1. **Parses** the codebase into a typed graph of files, symbols, routes, DB models, env vars, external services and the edges between them. This step uses tree-sitter, real import resolution and framework detectors, with no LLM involved.
2. **Understands** the code with an LLM that is *grounded on that graph*. It writes a summary for each file, rolls those up into module summaries, discovers **Features** (Authentication, Billing, Posts…) and the **Flows** through them, and writes an app overview.
3. **Serves** a local web UI that opens on the plain-English big picture. Every claim in the UI can be clicked through to the file, line or edge it came from.
4. **Answers** questions: instant find, full-text search over code and summaries, and **Ask**, an agent that queries the graph and answers with citations. Ask can also say "this isn't implemented" and show what it checked.
5. **Assesses** structure: deterministic health flags such as cycles, god files, hubs, unused exports and needless indirection, plus a plain-English **changeability card** per feature that says how hard it is to add to, change or remove.
6. **Exposes** the same graph to other AI agents (Cursor, Claude Code) over **MCP** *(Stretch)*. Those agents can then query the architecture instead of grepping blindly.

## Principles

These settle trade-offs. When in doubt, apply them in this order.

1. **Facts first, AI for synthesis.** Structural facts (who imports whom, who calls whom, which route writes which table) come from parsing. The LLM explains, groups and names things, and it never invents edges silently. Anything the LLM inferred is labelled as such and carries a confidence score.
2. **Every claim is one click from its evidence.** Plain-English text links to node IDs, and the UI renders those links as clickable file/line references. An explanation with no evidence counts as a bug.
3. **Plain English by default, depth on demand.** The default view is written for someone who doesn't know what "fan-in" means. Developers find the metrics, raw graph and provenance one click down. There is no separate "expert mode".
4. **Honest about uncertainty.** Provenance badges: `AST` (parsed), `Resolved` (import-resolved), `Heuristic` (name-matched), `AI-inferred` (LLM). "Not found" answers say what was searched.
5. **Local-first.** No Catalyst backend and no telemetry. Code leaves the machine only when it is sent to the LLM provider the user configured.
6. **Incremental and cached.** Everything is keyed by content hash, so re-running is cheap and only work affected by a change is redone.
7. **Hackathon pragmatism.** A working end-to-end path beats a polished partial one. Wherever an MVP shortcut was taken, the spec says so.

## Non-goals (for this product, not just the MVP)

- Not a linter or formatter. Catalyst flags structural issues and does not enforce style.
- Not a code generator or auto-refactorer. It explains and assesses, and it does not edit your code.
- Not a type checker. Call resolution is good enough for blast radius, not compiler-precise (see [ADR-0002](decisions/0002-web-tree-sitter.md)).
- Not a hosted SaaS, for now. The architecture leaves room for one (see [13-roadmap.md](13-roadmap.md)).

## Success criteria (hackathon demo)

On `shadcn-ui/taxonomy` (≈130 TS files), with an LLM configured:

1. `npx catalyst-dx` (or `catalyst`) in the repo root opens the UI and indexes the repo in **under 5 minutes**, with live progress shown.
2. The Overview correctly names the app's purpose and at least **4 real features** (e.g. Authentication, Billing/Subscriptions, Posts/Editor, Dashboard, Marketing pages), each linked to the right files.
3. Clicking `lib/session.ts` (or similar) shows a plain-English X-Ray: its purpose, its place in the app, its callers and callees, and its side effects. The callers and callees match the code.
4. The blast radius for an auth helper highlights the routes and pages that depend on it.
5. Ask *"Where do we handle Stripe webhooks?"* gives the correct file with a citation. Ask *"Do we have password reset?"* gives an evidence-backed "No".
6. The Health page lists at least the real cycles, the largest god file and any unused exports.
7. The same UI opens `full-stack-fastapi-template/backend` from the project picker and works for Python.
