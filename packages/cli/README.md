# Catalyst

Open a terminal in a project and run `npx catalyst-dx` with Node.js 22 or newer. Catalyst indexes the repository and opens the local web UI. For a permanent installation, run `npm install -g catalyst-dx`.

```sh
catalyst ui
catalyst index ./my-app --no-ai
catalyst serve ./my-app --no-open
catalyst health ./my-app --json
```

To enable summaries, feature explanations and Ask, choose a provider in Settings. Catalyst supports OpenRouter, Anthropic, OpenAI-compatible endpoints (including Ollama and LM Studio), and the Claude Code CLI. You can also use a configured provider key from the environment.

```sh
catalyst ask "Where are subscriptions updated?" ./my-app
catalyst impact ./my-app --no-narrative
catalyst mcp ./my-app
```

Catalyst stores the project index under `.catalyst/` in the repository. It binds to loopback by default, collects no telemetry, and uses the configured provider for AI requests. Structural indexing works offline.
