import { z } from 'zod';

export const ProviderType = z.enum(['openrouter', 'anthropic', 'openai-compatible', 'claude-code']);
export type ProviderType = z.infer<typeof ProviderType>;

export const ProviderConfig = z.discriminatedUnion('type', [
  z.object({ type: z.literal('openrouter'), apiKey: z.string(), baseUrl: z.string().default('https://openrouter.ai/api/v1') }),
  z.object({ type: z.literal('anthropic'), apiKey: z.string() }),
  z.object({ type: z.literal('openai-compatible'), apiKey: z.string().optional(), baseUrl: z.string(), name: z.string().default('custom') }),
  z.object({ type: z.literal('claude-code'), binary: z.string().default('claude') }),
]);
export type ProviderConfig = z.infer<typeof ProviderConfig>;

export const GlobalConfig = z.object({
  version: z.literal(1),
  provider: ProviderConfig.nullable(),
  models: z.object({ fast: z.string(), smart: z.string() }),
  outputLanguage: z.enum(['en', 'tr']).default('en'),
  budgetUsd: z.number().positive().nullable().default(null),
  concurrency: z.number().int().min(1).max(32).default(6),
  telemetry: z.literal(false).default(false),
});
export type GlobalConfig = z.infer<typeof GlobalConfig>;
