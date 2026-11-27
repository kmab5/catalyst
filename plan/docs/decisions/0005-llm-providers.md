# ADR-0005: Vercel AI SDK + OpenRouter default + a Claude Code CLI adapter (no Composio for LLMs)

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
Users bring their own access: an API key, a local model, or an existing coding-agent subscription. Composio was suggested for central key access, but it manages OAuth to third-party *tools* (GitHub, Slack…), not LLM inference.

## Decision
Define an `LLMProvider` interface. Implement it with the Vercel AI SDK for OpenRouter (the recommended default: one key, every model), Anthropic, and generic OpenAI-compatible endpoints (OpenAI, Ollama, LM Studio, Groq). Write our own adapter for the Claude Code CLI (`claude -p --output-format json`), which uses the user's existing plan. Use two model tiers, `fast` and `smart`, both configurable. Composio is reserved for the future hosted version's GitHub connection.

## Consequences
- Structured output and tool calling come for free on the API providers.
- The Claude Code adapter has no tool calling, so Ask uses a retrieval single-shot strategy there.
- Codex and Gemini CLI adapters are Later and fit the same interface.
