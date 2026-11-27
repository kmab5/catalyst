import type { ProviderType, TestProviderResult } from '@catalyst/shared';
import type { z } from 'zod';
export type ModelTier = 'fast' | 'smart';
// Disclose the HTTP category only. Provider error bodies can contain prompts or credentials.
export function providerHttpMessage(error: unknown, label: string): string | undefined {
  if (!error || typeof error !== 'object') return;
  const failure = 'lastError' in error ? error.lastError : error;
  if (!failure || typeof failure !== 'object' || !('statusCode' in failure)) return;
  switch (failure.statusCode) {
    case 401:
    case 403:
      return label + ' rejected the credentials. Check the API key in Settings.';
    case 413:
      return label + ' rejected the request size. Try a narrower scope or a model with a higher token limit.';
    case 429:
      return label + ' reached its rate limit. Wait for the quota to reset or lower indexing concurrency in Settings.';
    default:
      return;
  }
}
export type Models = Record<ModelTier, string>;
export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}
export interface TextRequest {
  tier: ModelTier;
  system: string;
  prompt: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
}
export interface ObjectRequest<T> extends TextRequest {
  schema: z.ZodType<T>;
  schemaName: string;
}
export interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
}
export interface ToolDef {
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (input: any) => Promise<unknown>;
}
export interface StreamRequest {
  tier: ModelTier;
  system: string;
  messages: ChatMessage[];
  tools?: Record<string, ToolDef>;
  maxSteps?: number;
  signal?: AbortSignal;
}
export type StreamPart =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; name: string; args: unknown }
  | { type: 'tool-result'; name: string; result: unknown }
  | { type: 'finish'; usage: LLMUsage }
  | { type: 'error'; message: string };
export interface LLMProvider {
  id: ProviderType;
  label: string;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
  local?: boolean;
  modelFor(tier: ModelTier): string;
  generateText(req: TextRequest): Promise<{ text: string; usage: LLMUsage }>;
  generateObject<T>(req: ObjectRequest<T>): Promise<{ object: T; usage: LLMUsage }>;
  streamText(req: StreamRequest): AsyncIterable<StreamPart>;
  test(): Promise<TestProviderResult>;
}
export async function testProvider(p: LLMProvider): Promise<TestProviderResult> {
  const start = Date.now(),
    model = p.modelFor('fast');
  try {
    await p.generateText({
      tier: 'fast',
      system: 'Reply briefly.',
      prompt: 'Say OK.',
      maxOutputTokens: 16,
      signal: AbortSignal.timeout(15000),
    });
    return { ok: true, model, latencyMs: Date.now() - start };
  } catch {
    return {
      ok: false,
      model,
      latencyMs: Date.now() - start,
      message: 'Provider request failed. Check the endpoint, key and model.',
    };
  }
}
