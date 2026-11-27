import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderConfig } from '@catalyst/shared';
import { DEFAULT_MODELS } from '../defaults.js';
import { SdkProvider } from './ai-sdk.js';
import { ClaudeCodeProvider } from './claude-code.js';
import type { LLMProvider, Models } from './types.js';
export function createProvider(
  config: ProviderConfig,
  models: Models = DEFAULT_MODELS[config.type],
  root?: string,
): LLMProvider {
  if (config.type === 'claude-code') return new ClaudeCodeProvider(config.binary, models, root);
  if (config.type === 'anthropic')
    return new SdkProvider(config.type, 'Anthropic', models, createAnthropic({ apiKey: config.apiKey }));
  const router = config.type === 'openrouter';
  const endpoint = new URL(config.type === 'groq' ? 'https://api.groq.com/openai/v1' : config.baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  const sdk = createOpenAICompatible({
    name: config.type,
    baseURL: endpoint.href.replace(/\/$/, ''),
    apiKey: config.apiKey,
    supportsStructuredOutputs: !local,
    headers: router
      ? { 'HTTP-Referer': 'https://github.com/kmab5/catalyst', 'X-Title': 'Catalyst' }
      : undefined,
  });
  return new SdkProvider(config.type, router ? 'OpenRouter' : config.type === 'groq' ? 'Groq' : config.name, models, sdk, local);
}
