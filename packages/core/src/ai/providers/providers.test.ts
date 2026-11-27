import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { PassThrough, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createProvider } from './factory.js';
import { price } from '../pricing.js';
import { ClaudeCodeProvider } from './claude-code.js';
import * as childProcess from 'node:child_process';
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));
test('OpenRouter selects zero-cost models for both tiers by default', () => {
  const provider = createProvider({ type: 'openrouter', apiKey: 'test', baseUrl: 'https://openrouter.ai/api/v1' });
  for (const tier of ['fast', 'smart'] as const) {
    expect(provider.modelFor(tier)).toBe('openrouter/free');
    expect(price(provider.modelFor(tier), 1000, 250)).toBe(0);
  }
});

test('Claude Code writes the prompt to stdin, disables tools and reads assistant JSON', async () => {
  let stdin = '';
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stdin: new Writable({
      write(chunk, _encoding, cb) {
        stdin += chunk.toString();
        cb();
      },
      final(cb) {
        child.stdout.end(
          JSON.stringify({
            result: '```json\n{"value":4}\n```',
            usage: { input_tokens: 17, output_tokens: 5 },
          }),
        );
        child.emit('close', 0);
        cb();
      },
    }),
    kill: vi.fn(),
  });
  vi.mocked(childProcess.spawn).mockReturnValue(
    child as unknown as ReturnType<typeof childProcess.spawn>,
  );
  const p = new ClaudeCodeProvider('claude', { fast: 'haiku', smart: 'sonnet' }, process.cwd());
  const r = await p.generateObject({
    tier: 'fast',
    schema: z.object({ value: z.number() }),
    schemaName: 'Answer',
    system: 'System instruction',
    prompt: 'Private prompt contents',
  });
  expect(r).toMatchObject({ object: { value: 4 }, usage: { inputTokens: 17, outputTokens: 5 } });
  expect(stdin).toContain('Private prompt contents');
  const [, args] = vi.mocked(childProcess.spawn).mock.calls[0]!;
  expect(args).toContain('--tools');
  expect(args).toContain('');
  expect(args).not.toContain('Private prompt contents');
});
test('OpenAI-compatible adapter sends the chosen model and measures usage against loopback transport', async () => {
  let body: Record<string, unknown> = {};
  const server = createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    body = JSON.parse(data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'completion',
        object: 'chat.completion',
        created: 1,
        model: 'local-example',
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/v1',
      p = createProvider(
        { type: 'openai-compatible', baseUrl, name: 'local' },
        { fast: 'local-example', smart: 'local-smart' },
      );
    const result = await p.generateText({
      tier: 'fast',
      system: 'Answer',
      prompt: 'Hello',
      maxOutputTokens: 12,
    });
    expect(result).toMatchObject({ text: 'OK', usage: { inputTokens: 10, outputTokens: 2 } });
    expect(body).toMatchObject({
      model: 'local-example',
      messages: [
        { role: 'system', content: 'Answer' },
        { role: 'user', content: 'Hello' },
      ],
    });
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
