import type { ProviderType, TestProviderResult } from '@catalyst/shared';
import type { z } from 'zod';
export type ModelTier = 'fast' | 'smart';
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
  schema: z.ZodType<T, z.ZodTypeDef, any>;
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
