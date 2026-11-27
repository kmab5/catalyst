import {
  generateObject,
  generateText,
  streamText,
  stepCountIs,
  tool,
  type LanguageModel,
  type LanguageModelUsage,
} from 'ai';
import type {
  LLMProvider,
  Models,
  ModelTier,
  ObjectRequest,
  StreamRequest,
  TextRequest,
  StreamPart,
} from './types.js';
import { testProvider } from './types.js';
const usage = (u: LanguageModelUsage, body?: unknown) => {
  const cost = (body as { usage?: { cost?: number } } | undefined)?.usage?.cost;
  return {
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    ...(typeof cost === 'number' ? { costUsd: cost } : {}),
  };
};
export class SdkProvider implements LLMProvider {
  supportsStreaming = true;
  constructor(
    readonly id: LLMProvider['id'],
    readonly label: string,
    private models: Models,
    private model: (name: string) => LanguageModel,
    readonly local = false,
    readonly supportsTools = !local,
    readonly supportsStructuredOutput = !local,
  ) {}
  modelFor(tier: ModelTier) {
    return this.models[tier];
  }
  private options(r: TextRequest) {
    const name = this.modelFor(r.tier);
    const knownClaude = /^(?:anthropic\/)?claude-(haiku|sonnet)-5[.-]5$/.test(name);
    // Limit hidden reasoning on high-volume structured tasks. Other configured models keep their defaults.
    const effort = r.tier === 'fast' ? 'low' : 'medium';
    const providerOptions: NonNullable<Parameters<typeof generateText>[0]['providerOptions']> = {};
    if (knownClaude && this.id === 'openrouter') providerOptions.openrouter = {reasoning: {effort}};
    if (knownClaude && this.id === 'anthropic') providerOptions.anthropic = {effort};
    return {
      model: this.model(this.modelFor(r.tier)),
      system: r.system,
      prompt: r.prompt,
      maxOutputTokens: r.maxOutputTokens,
      abortSignal: r.signal,
      maxRetries: 0,
      providerOptions,
    };
  }
  async generateObject<T>(r: ObjectRequest<T>) {
    const response = await generateObject({
      ...this.options(r),
      schema: r.schema,
      schemaName: r.schemaName,
    });
    return { object: response.object as T, usage: usage(response.usage, response.response.body) };
  }
  async generateText(r: TextRequest) {
    const response = await generateText(this.options(r));
    return { text: response.text, usage: usage(response.usage, response.response.body) };
  }
  async *streamText(r: StreamRequest): AsyncIterable<StreamPart> {
    const tools = Object.fromEntries(
      Object.entries(r.tools ?? {}).map(([name, def]) => [name, tool(def)]),
    );
    const response = streamText({
      model: this.model(this.modelFor(r.tier)),
      system: r.system,
      messages: r.messages,
      tools,
      stopWhen: stepCountIs(r.maxSteps ?? 1),
      abortSignal: r.signal,
      maxRetries: 0,
      onError: () => {},
    });
    for await (const event of response.fullStream) {
      switch (event.type) {
        case 'text-delta':
          yield { type: 'text-delta', text: event.text };
          break;
        case 'tool-call':
          yield { type: 'tool-call', name: event.toolName, args: event.input };
          break;
        case 'tool-result':
          yield { type: 'tool-result', name: event.toolName, result: event.output };
          break;
        case 'finish':
          yield { type: 'finish', usage: usage(event.totalUsage) };
          break;
        case 'error':
          yield { type: 'error', message: 'Provider stream failed' };
          break;
      }
    }
  }
  test() {
    return testProvider(this);
  }
}
