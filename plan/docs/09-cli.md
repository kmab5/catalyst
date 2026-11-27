# 09 — CLI

The package is **`catalyst-dx`** on npm and installs the binary **`catalyst`**. It's built with `commander`, writes its output with `picocolors`, and opens the browser with `open`. The CLI is a thin shell over `core`'s `Engine`, plus the `server` package. It never implements analysis logic itself.

```bash
npx catalyst-dx            # zero-install
npm i -g catalyst-dx       # then: catalyst
```

## 1. Two ways in (both are required)

| Mode | How | What happens |
|---|---|---|
| **Run in the root** | `cd my-app && catalyst` (or `catalyst ./my-app`) | The path is detected as a project, so the server starts, the project opens (and is indexed if needed), and the browser opens at `/p/:pid/overview` (or `/p/:pid/indexing` while indexing). |
| **Launcher** | `catalyst ui`, or `catalyst` in a folder that isn't a project | The server starts and the browser opens at `/` (the Launcher), where the user picks or pastes any folder. See [10 §3.1](10-web-ui.md#31-launcher--project-picker). |

**Project detection.** A directory counts as a project if it contains any of: `.git`, `package.json`, `pyproject.toml`, `requirements.txt`, `setup.py`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`, or a `.catalyst/` directory. Only the given directory is checked (no walking upward), so running inside `my-app/src` opens the launcher with `my-app` suggested if an ancestor matches.

## 2. Commands

### `catalyst [path]` — default *(MVP)*

The same as `catalyst serve [path]`, but it auto-starts indexing:

1. Check the Node version (§5). Resolve `path` (default: cwd).
2. If `path` is a project: register it, ensure `.catalyst/` exists, update `.gitignore` (§4), and start the server.
   - `never-indexed` or `stale` → start an incremental index (`ai: true` if a provider is configured).
   - `ready` → index nothing; just open.
3. Otherwise, start the server and open the launcher.
4. Print the URL and the token-free link, then open the browser (unless `--no-open`).
5. Stream progress to the terminal (§3) while the UI shows the same events.

| Flag | Default | Meaning |
|---|---|---|
| `--no-index` | — | Open without starting an index |
| `--no-ai` | — | Index structurally only |
| `--lang <en\|tr>` | settings | Output language for AI text *(Stretch)* |
| plus all [global flags](#3-global-flags-output--exit-codes) | | |

### `catalyst ui` *(MVP)*
Always opens the **launcher** at `/`, even when cwd is a project. If cwd is a project, the launcher pre-fills it as a suggestion.

### `catalyst serve [path]` *(MVP)*
Starts the server without auto-indexing. It opens the project if `path` is one, and otherwise the launcher.

| Flag | Default | Meaning |
|---|---|---|
| `--port <n>` | `4321` | If the port is taken, try `n+1 … n+20`, and print the port actually used |
| `--host <h>` | `127.0.0.1` | Anything other than loopback prints `⚠ Catalyst is reachable from your network. Anyone with the URL can read your code summaries.` |
| `--no-open` | — | Don't open the browser |

### `catalyst index [path]` *(MVP)*
Headless indexing. Prints progress and exits; no server.

| Flag | Default | Meaning |
|---|---|---|
| `--no-ai` | — | Skip the AI stages |
| `--force` | — | Full re-index: ignore the parse cache and the LLM cache (`mode: 'full'`) |
| `--budget <usd>` | settings | Stop the AI stages when the estimated spend reaches the cap. Completed work is kept and `aiStatus = 'partial'` |
| `--lang <en\|tr>` | settings | Output language *(Stretch)* |
| `--concurrency <n>` | settings (6) | Number of parallel LLM calls |
| `--json` | — | Print the final `RunDTO` as JSON on stdout; progress goes to stderr |

### `catalyst ask "<question>" [path]` *(MVP)*
Runs the Ask agent against the index. The project must already be indexed; if it isn't, the command exits with code 3 and a hint.

- By default it streams the answer as markdown to stdout. `[[nodeId]]` citations are rendered as `file:line` references (e.g. `lib/session.ts:12`), and a **Sources** list follows the answer.
- `found: false` prints `Not found.`, followed by `Checked:` and the `searched` items.
- `--json` prints the final `AskAnswer` as JSON.
- `--lang <en|tr>` *(Stretch)*.

### `catalyst health [path]` *(MVP backend, CLI Stretch)*
Prints the flags grouped by severity, the cycles as `a.ts → b.ts → a.ts`, and the top 5 hubs. With `--json` it prints `HealthDTO`. `--fail-on <high|warn>` exits with code 1 if any flag is at or above that severity (CI use, Later).

### `catalyst impact [path]` *(Stretch)*
| Flag | Default | Meaning |
|---|---|---|
| `--base <ref>` | — | Compare `<ref>...HEAD` plus the working tree. If omitted, compare uncommitted changes against `HEAD` |
| `--no-narrative` | — | Skip the AI risk narrative |
| `--json` | — | Print `DiffImpactDTO` |

Output: changed files → changed symbols → affected features (changed/affected counts) → affected routes → the narrative.

### `catalyst mcp [path]` *(Stretch)*
Starts the MCP stdio server ([08 §4](08-api.md#4-mcp-server-stretch)). Nothing is written to stdout except MCP frames; all logs go to stderr.

### `catalyst config …` *(MVP: get/set/list; Stretch: provider)*

```bash
catalyst config list                                  # prints settings, keys masked
catalyst config get outputLanguage
catalyst config set provider.type openrouter
catalyst config set provider.apiKey sk-or-...         # stored in ~/.catalyst/config.json (chmod 600)
catalyst config set models.fast claude-haiku-5-5   # model IDs per provider: see 07
catalyst config set models.smart claude-sonnet-5-5
catalyst config set outputLanguage tr
catalyst config set budgetUsd 2
catalyst config provider                              # interactive picker (Stretch): detects claude CLI / Ollama / env keys, tests connection
```

The keys and their validation follow `SettingsUpdate` ([08 §2.1](08-api.md#21-additional-dtos)). Defaults and file locations are in [12](12-config-and-privacy.md).

### `catalyst projects` *(Stretch)*
Lists recent projects with their status. `catalyst projects forget <path|id>`.

## 3. Global flags, output & exit codes

| Flag | Meaning |
|---|---|
| `--port <n>` / `--host <h>` / `--no-open` | As for `serve` (they apply to any command that starts the server) |
| `--verbose` | Debug logs to stderr (the same as `CATALYST_LOG=debug`) |
| `--version`, `--help` | Standard |

### Terminal output (interactive TTY)

```
  ◆ catalyst v0.1.0

  Project   taxonomy  (~/code/taxonomy)
  Provider  OpenRouter · fast: claude-haiku-5-5 · smart: claude-sonnet-5-5
  UI        http://127.0.0.1:4321/p/3f9a1c2b7d04

  ✓ scan        188 files (129 analysable · TS/TSX 121 · JS 8)        0.2s
  ✓ parse       129/129                                               0.9s
  ✓ resolve     1,412 imports · 97% resolved                          0.3s
  ✓ detect      14 routes · 6 models · 9 env vars · 4 services        0.1s
  ✓ health      3 high · 11 warn                                      0.1s
  ◐ summarize   84/129   tokens 212k in / 31k out   cache 0
    rollup      —
    features    —
    overview    —

  Press Ctrl+C to stop (the UI keeps the progress so far).
```

- On a TTY the block redraws in place (≤ 10 fps). When stdout isn't a TTY or `--json` is set, it prints one line per stage transition, e.g. `[catalyst] summarize 84/129`.
- Errors in a single file never stop the run. They are counted (`parse 128/129 · 1 error`) and listed with `--verbose`.
- Ctrl+C once cancels the active run and keeps the server running for 2 s, then exits. Pressing it twice exits immediately.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic failure / `--fail-on` threshold hit |
| 2 | Bad arguments or bad config value |
| 3 | Project not indexed (for `ask`, `health`, `impact`) / path not found |
| 4 | AI required but not configured (`ask`, `impact` with a narrative) |
| 5 | Provider error (auth, quota, network) |
| 6 | Unsupported Node version |
| 130 | Interrupted (Ctrl+C) |

## 4. `.gitignore` handling

When a project is opened for the first time and `.catalyst/` is created:

- If `<root>/.gitignore` **exists** and doesn't already match `.catalyst` (checked by a simple line match on `.catalyst`, `.catalyst/` or `/.catalyst/`), append `\n# Catalyst local index\n.catalyst/\n` and print `ℹ Added .catalyst/ to .gitignore`.
- If no `.gitignore` exists, **don't create one**. Instead print `ℹ Tip: add .catalyst/ to your .gitignore`.
- If the root isn't writable, fail with code 3 and the message: `Cannot write .catalyst/ in <root>. Catalyst stores its index next to your code.` A fallback to `~/.catalyst/cache/<pid>/` is Later.

## 5. Node version check

Catalyst needs Node ≥ 22. The check runs first, before any other import that might fail:

```
✗ Catalyst needs Node.js 22 or newer (found v18.19.0).
  Install it from https://nodejs.org or with your version manager (nvm install 22).
```
The command then exits with code 6.

## 6. First run without a provider

If no provider is configured (no config entry, and none of `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set) and the `claude` CLI isn't detected on PATH:

1. Index **structurally** (no AI). This is not an error.
2. Print:
   ```
   ℹ No AI provider configured — showing structure only (graph, search, health).
     Connect one to get plain-English explanations and features:
       • In the UI: Settings → AI provider
       • Or: catalyst config set provider.type openrouter && catalyst config set provider.apiKey <key>
   ```
3. Open the UI anyway. The UI shows the `NoAIBanner` and the Connect-AI step ([10 §3.2](10-web-ui.md#32-indexing-progress)).

If the `claude` CLI **is** detected and no provider is configured, Catalyst selects `claude-code` automatically and prints `ℹ Using Claude Code CLI (billed to your Claude plan). Change in Settings.`. Auto-selecting any provider requires either an existing login or a key already in the environment, so no new account or key is ever set up without the user.

If a key is present in the environment, the matching provider is auto-selected in this order: `ANTHROPIC_API_KEY` → anthropic, then `OPENROUTER_API_KEY` → openrouter, then `OPENAI_API_KEY` → openai-compatible (`https://api.openai.com/v1`). The config is never written automatically; env-derived settings show `apiKeySource: 'env'`.
