export const DEFAULT_MODELS = {
  anthropic: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' },
  openrouter: { fast: 'anthropic/claude-haiku-5.5', smart: 'anthropic/claude-sonnet-5.5' },
  'openai-compatible': { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
  'claude-code': { fast: 'haiku', smart: 'sonnet' },
} as const;
export const PROMPT_VERSION = {
  summarize: 1,
  rollup: 1,
  features: 1,
  overview: 1,
  changeability: 1,
  ask: 1,
};
