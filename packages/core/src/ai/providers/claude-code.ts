import { spawn } from 'node:child_process';
import { asSchema } from 'ai';
import type {
  LLMProvider,
  Models,
  ModelTier,
  ObjectRequest,
  TextRequest,
  StreamRequest,
  StreamPart,
} from './types.js';
import { testProvider } from './types.js';
import { parseOutput } from '../json.js';
export class ClaudeCodeProvider implements LLMProvider {
  id = 'claude-code' as const;
  label = 'Claude Code';
  supportsTools = false;
  supportsStreaming = false;
  supportsStructuredOutput = false;
  constructor(
    private binary: string,
    private models: Models,
    private root?: string,
  ) {}
  modelFor(tier: ModelTier) {
    return this.models[tier];
  }
  async generateText(r: TextRequest) {
    const prompt = r.system + '\n\n<user_data>\n' + r.prompt + '\n</user_data>';
    const timeout = AbortSignal.timeout(120000);
    const signal = r.signal ? AbortSignal.any([timeout, r.signal]) : timeout;
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        this.binary,
        [
          '-p',
          '--output-format',
          'json',
          '--model',
          this.modelFor(r.tier),
          '--tools',
          '',
          '--strict-mcp-config',
          '--no-session-persistence',
          '--setting-sources',
          'user',
        ],
        { cwd: this.root, signal, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
      );
      let text = '';
      child.on('error', reject);
      child.stdout.setEncoding('utf8').on('data', (data: string) => {
        text += data;
        if (text.length > 4000000) {
          child.kill();
          reject(new Error('Provider response too large'));
        }
      });
      child.on('close', (code) =>
        code === 0 ? resolve(text) : reject(new Error('Claude Code request failed')),
      );
      child.stdin.on('error', reject);
      child.stdin.end(prompt);
    });
    const result = JSON.parse(stdout);
    if (result.is_error || typeof result.result !== 'string')
      throw new Error('Claude Code returned no answer');
    return {
      text: result.result as string,
      usage: {
        inputTokens: result.usage?.input_tokens ?? Math.ceil(prompt.length / 3.5),
        outputTokens: result.usage?.output_tokens ?? Math.ceil(result.result.length / 3.5),
        costUsd: result.total_cost_usd,
      },
    };
  }
  async generateObject<T>(r: ObjectRequest<T>) {
    const result = await this.generateText({
      ...r,
      prompt: r.prompt + '\nSchema: ' + JSON.stringify(await asSchema(r.schema).jsonSchema),
    });
    return { object: parseOutput(result.text, r.schema), usage: result.usage };
  }
  async *streamText(r: StreamRequest): AsyncIterable<StreamPart> {
    const result = await this.generateText({ ...r, prompt: JSON.stringify(r.messages) });
    yield { type: 'text-delta', text: result.text };
    yield { type: 'finish', usage: result.usage };
  }
  test() {
    return testProvider(this);
  }
}
