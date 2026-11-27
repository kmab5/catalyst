import type {
  LLMProvider,
  ModelTier,
  ObjectRequest,
  TextRequest,
  StreamRequest,
  StreamPart,
} from './types.js';
const usage = { inputTokens: 30, outputTokens: 20, costUsd: 0.001 };
type Script = {
  objects?: Record<string, unknown[] | ((prompt: string) => unknown)>;
  texts?: string[];
  streams?: StreamPart[][];
  failTimes?: number;
  supportsTools?: boolean;
};
export class FakeProvider implements LLMProvider {
  id = 'openrouter' as const;
  label = 'Fake provider';
  supportsTools: boolean;
  supportsStructuredOutput = true;
  supportsStreaming = true;
  calls: { schemaName?: string; prompt: string }[] = [];
  constructor(private script: Script = {}) {
    this.supportsTools = script.supportsTools ?? true;
  }
  modelFor(tier: ModelTier) {
    return tier === 'fast' ? 'claude-haiku-5-5' : 'claude-sonnet-5-5';
  }
  private record(prompt: string, schemaName?: string) {
    this.calls.push({ prompt, schemaName });
    if ((this.script.failTimes ?? 0) > 0) {
      this.script.failTimes!--;
      throw Object.assign(new Error('Rate limited'), {
        statusCode: 429,
        responseHeaders: { 'retry-after': '0' },
      });
    }
  }
  async generateObject<T>(r: ObjectRequest<T>) {
    this.record(r.system + '\n' + r.prompt, r.schemaName);
    const script = this.script.objects?.[r.schemaName],
      object = typeof script === 'function' ? script(r.prompt) : script?.shift();
    if (object === undefined) throw new Error('Missing fake response for ' + r.schemaName);
    return { object: object as T, usage };
  }
  async generateText(r: TextRequest) {
    this.record(r.system + '\n' + r.prompt);
    return { text: this.script.texts?.shift() ?? '', usage };
  }
  async *streamText(r: StreamRequest): AsyncIterable<StreamPart> {
    this.record(r.system + '\n' + JSON.stringify(r.messages));
    for (const part of this.script.streams?.shift() ?? []) yield part;
  }
  async test() {
    return { ok: true, model: this.modelFor('fast'), latencyMs: 0 };
  }
}
