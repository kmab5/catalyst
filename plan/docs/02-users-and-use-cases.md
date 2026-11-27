# 02 — Users & Use Cases

## Personas

### P1 — Maya, the vibe coder *(primary; all defaults are tuned for her)*
- Built a Next.js + Supabase + Stripe SaaS mostly by prompting an AI assistant. Knows roughly what the app *does* but not how the code is organised.
- Vocabulary: "login", "the database", "payments", "the page that…". She does not say "fan-in" or "module coupling".
- Needs: orientation ("what is all this?"), location ("where is X?"), existence ("do I have Y?"), safety ("what breaks if I change Z?"), and things she can paste back into her AI assistant.
- Success: in 5 minutes she can explain her app's architecture to someone else.

### P2 — Daniel, the developer *(secondary; reaches depth one click down)*
- Joining a team, auditing a client repo, or planning a refactor.
- Needs: an accurate dependency and call graph, blast radius, coupling between features, cycles, hubs, dead code, and an estimate of how hard a change will be.
- Distrusts AI output, so provenance and click-through to source matter to him.

### P3 — An AI coding agent *(Stretch, via MCP)*
- Cursor or Claude Code working in the same repo.
- Needs structured, exact answers instead of greps: "callers of X", "which feature owns this file", "what does this route touch", "is there already a helper for Y".

## Core questions → how Catalyst answers

| # | User question | Catalyst answer path | Priority |
|---|---|---|---|
| Q1 | "What is this app and how is it put together?" | **Overview**: app summary, detected stack, feature cards, entry points | MVP |
| Q2 | "What does this file/function do?" | **X-Ray panel**: purpose, position in the app, callers and callees, side effects, flags | MVP |
| Q3 | "Where is login / payments / email handled?" | **Features** view, plus **Search** over summaries and tags, plus **Ask** | MVP |
| Q4 | "Do I have password reset / rate limiting / tests?" | **Ask** with an evidence-backed "not found", listing what was searched | MVP |
| Q5 | "If I change this, what breaks?" | **Blast radius** in the graph and X-Ray: upstream dependants grouped by feature and route | MVP |
| Q6 | "How does a request flow from the page to the DB?" | **Flows** inside a Feature: ordered steps from entry to handler to service to data | MVP (list) / Stretch (diagram) |
| Q7 | "Is my code a mess? Where?" | **Health**: flags by severity, with plain-English explanations | MVP |
| Q8 | "How hard is it to add/remove/refactor feature F?" | **Changeability card** on each feature | MVP |
| Q9 | "What does my current diff/branch affect?" | **Impact**: changed nodes mapped to affected features, routes and dependants | Stretch |
| Q10 | "Which routes write to the DB without auth?" | **Ask** using graph tools (relational query) | MVP (via Ask) |
| Q11 | "Explain it in Turkish" | `outputLanguage: tr` for all AI-written text | Stretch |
| Q12 | Agent: "get context for symbol X" | **MCP** `get_symbol_context` | Stretch |

## Key user journeys

### J1 — First run (Maya)
1. `cd my-app && npx catalyst-dx`
2. The terminal prints the URL. The browser opens to the **indexing screen**, which shows stages (Scanning → Parsing → Linking → Detecting → Summarising → Discovering features → Overview) with counts.
3. If no AI provider is configured, the UI shows a **Connect AI** step: choose Claude Code CLI (if detected), OpenRouter, Anthropic or OpenAI-compatible/Ollama, then test the connection. The user can skip this and get a structural-only view.
4. A **cost estimate** appears before the AI stages run *(Stretch; MVP shows only a file count)*.
5. When indexing finishes, the app lands on the **Overview**.

### J2 — "Where is X?" (Maya)
1. She presses `Ctrl/Cmd+K` and types "stripe webhook".
2. Results come in three groups: **Find** (symbol and file names), **Search** (summary and code matches) and an **Ask** row ("Ask: stripe webhook").
3. She clicks a result, and the Explorer opens the file with the X-Ray panel.

### J3 — Safe change (Daniel)
1. In the Explorer he selects `getCurrentUser`.
2. X-Ray → **"If you change this"**: 14 dependants across 3 features and 6 routes, listed by feature.
3. "Show in graph" opens the graph with the blast radius highlighted, upstream in one colour and downstream in another.

### J4 — Project picker (either)
1. `catalyst ui` (or `catalyst` in a folder that is not a project) opens the **Launcher**.
2. The user pastes or chooses a folder path, or picks a recent project. Catalyst indexes it there, with the cache stored in that folder's `.catalyst/`.

### J5 — Agent integration (Stretch)
1. `claude mcp add catalyst -- npx catalyst-dx mcp` (or the Cursor equivalent).
2. The agent calls `get_blast_radius("sym:lib/session.ts#getCurrentUser")` before editing.

## Demo script (hackathon, ~4 minutes)

Use `shadcn-ui/taxonomy`, pre-indexed so the cache is warm, and show a live re-index of one changed file.

1. **Hook (20s):** "You vibe-coded an app. Do you know what's in it?" Run `npx catalyst-dx`.
2. **Overview (40s):** the app summary, the feature cards (Auth, Billing, Editor, Dashboard, Marketing) and the detected stack (Next.js, Prisma, next-auth, Stripe).
3. **Feature (40s):** open Billing → entry points (`/api/webhooks/stripe`, the pricing page), the flow steps, member files and the changeability card.
4. **X-Ray (40s):** click the session helper → plain-English purpose, callers, side effects, and the blast radius in the graph.
5. **Ask (60s):** "Where do we handle Stripe webhooks?" → cited answer. "Do we have password reset?" → "No. I searched auth routes, next-auth config and email senders…"
6. **Health (30s):** the real cycles and god file, each with a plain-English explanation of why it matters.
7. **Python (30s):** open the FastAPI template from the Launcher to show that it works across languages.
8. **Close (20s):** "Facts from the parser, explanations from AI, and every claim clickable." (If MCP is done: show Claude Code calling `get_blast_radius`.)
