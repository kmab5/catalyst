# 12 — Config & Privacy

## 1. Where state lives

| Location | Contents | Committed to git? |
|---|---|---|
| `~/.catalyst/config.json` | Global settings: provider, API keys, models, default language, budget, concurrency | Never (home dir) |
| `~/.catalyst/projects.json` | Recent projects: `{ id, root, name, lastOpenedAt, lastIndexedAt }[]` | Never |
| `<project>/.catalyst/catalyst.db` | The project's graph, summaries, features, flags, LLM cache | No. `.catalyst/` is auto-added to `.gitignore` |
| `<project>/catalyst.config.json` | *Optional* per-project overrides (ignore globs, health thresholds, language, detector toggles). **Never contains keys.** | Yes (safe to commit) |
| `<project>/.catalystignore` | Extra ignore patterns (gitignore syntax) | Yes |

On Windows, `~` resolves to `%USERPROFILE%`. Inside WSL it resolves to the Linux home, so a WSL `catalyst` and a Windows `catalyst` keep separate configs, which is fine.

## 2. Global config schema

```ts
// shared/schemas/config.ts
const ProviderConfig = z.discriminatedUnion('type', [
  z.object({ type: z.literal('openrouter'), apiKey: z.string(), baseUrl: z.string().default('https://openrouter.ai/api/v1') }),
  z.object({ type: z.literal('anthropic'), apiKey: z.string() }),
  z.object({ type: z.literal('openai-compatible'), apiKey: z.string().optional(), baseUrl: z.string(), name: z.string().default('custom') }), // OpenAI, Ollama (http://localhost:11434/v1), LM Studio, Groq…
  z.object({ type: z.literal('claude-code'), binary: z.string().default('claude') }),
]);

const GlobalConfig = z.object({
  version: z.literal(1),
  provider: ProviderConfig.nullable(),           // null → structural-only mode
  models: z.object({ fast: z.string(), smart: z.string() }),   // provider-specific IDs; see 07
  outputLanguage: z.enum(['en', 'tr']).default('en'),
  budgetUsd: z.number().positive().nullable().default(null),   // per index run; null = no cap
  concurrency: z.number().int().min(1).max(32).default(6),
  telemetry: z.literal(false).default(false),    // there is no telemetry; field exists to make that explicit
});
```

**Environment variables override the file** (useful for CI and demos): `CATALYST_PROVIDER`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CATALYST_MODEL_FAST`, `CATALYST_MODEL_SMART`, `CATALYST_LANG`, `CATALYST_PORT`.

If there is no config file, the provider is auto-selected in this order: `ANTHROPIC_API_KEY` → anthropic, `OPENROUTER_API_KEY` → openrouter, `OPENAI_API_KEY` → openai-compatible, `claude` on PATH → claude-code, otherwise none. The UI's Settings screen shows which one was picked and why.

## 3. Per-project config (`catalyst.config.json`, optional)

```jsonc
{
  "ignore": ["legacy/**", "**/*.generated.ts"],
  "include": ["backend/**"],                 // if set, only these are analysed
  "outputLanguage": "tr",
  "health": {                                // full shape: 11-health-analysis.md §3
    "disabled": ["deep-relative-import"],
    "thresholds": { "god-file": { "loc": 500 }, "god-function": { "cc": 20 }, "hub": { "minFanIn": 15 } }
  },
  "detectors": { "supabase": false },
  "maxFileBytes": 1048576
}
```

## 4. Ignore rules (applied in order)

1. Built-in ignores (see [06 §1](06-analysis-pipeline.md)): `node_modules`, `.git`, build outputs, virtualenvs, caches, lockfiles, minified/binary files, `.catalyst/`.
2. `.gitignore` files, at every directory level.
3. `.catalystignore`.
4. `catalyst.config.json` `ignore` / `include`.

**Secrets files are never read for content:** `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `*.p12`, `credentials*.json`, `secrets.*`. Exception: `.env.example` and `.env.sample` *are* read, but only to collect env var **names** for `env_var` nodes, never values.

## 5. Privacy guarantees

| Guarantee | How it is enforced |
|---|---|
| No Catalyst backend, no telemetry | There is no network code except the LLM provider adapters. `telemetry` is literally `false`. |
| Code is sent only to the configured provider | All outbound calls go through `LLMProvider`. With no provider set, the AI stages are skipped and nothing leaves the machine. |
| The user knows what is sent | The Settings and indexing screens state: "File contents and summaries are sent to **<provider>** to generate explanations." The Stretch estimate dialog shows file and token counts before the first AI run. |
| Secrets are not sent | Secret files are never read (§4). Before any prompt is assembled, a **redaction pass** masks likely secrets inside code: strings matching known key patterns (`sk-…`, `sk_live_…`, `AKIA…`, `ghp_…`, `xox…`, JWT-shaped strings, PEM blocks, and high-entropy strings of 32+ characters assigned to names like `key|secret|token|password`). They are replaced with `«redacted»`. |
| Keys are protected | Keys are stored only in `~/.catalyst/config.json` (on POSIX the file is written with mode `0600`). The API never returns keys; GET settings masks them as `sk-…abcd`. Keys are never logged. |
| The local server isn't exposed | The server binds to `127.0.0.1` by default. Mutating endpoints require the per-launch token (see [08 §1](08-api.md)). `--host 0.0.0.0` prints a warning. |
| The Claude Code provider | Runs the user's own `claude` binary, so data handling follows the user's Claude Code/Anthropic account terms. Said explicitly in Settings. |
| Local models | With Ollama or LM Studio (`openai-compatible` on localhost), nothing leaves the machine. Settings shows a "fully local" badge. |
