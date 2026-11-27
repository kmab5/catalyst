import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useAsk } from './useAsk';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function streamed() {
  let sink!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        sink = controller;
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
  const send = (data: { type: string; [key: string]: unknown }) =>
    sink.enqueue(
      new TextEncoder().encode(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`),
    );
  return { response, send, end: () => sink.close() };
}

test('tokens accumulate before the final grounded answer is available', async () => {
  const stream = streamed();
  vi.stubGlobal('fetch', async () => stream.response);
  const { result } = renderHook(() => useAsk('project'));
  act(() => {
    void result.current.ask('Who calls this?');
  });
  act(() => {
    stream.send({ type: 'thinking', text: 'Reading the graph' });
    stream.send({ type: 'token', text: 'Two' });
    stream.send({ type: 'token', text: ' files.' });
  });
  await waitFor(() => expect(result.current.text).toBe('Two files.'));
  expect(result.current.status).toBe('streaming');
  expect(result.current.trace).toHaveLength(1);
  act(() => {
    stream.send({
      type: 'done',
      answer: { markdown: 'Two callers.', citations: [], searched: [], found: true },
    });
    stream.end();
  });
  await waitFor(() => expect(result.current.status).toBe('done'));
  expect(result.current.answer?.found).toBe(true);
  expect(result.current.text).toBe('Two callers.');
});

test('an interrupted stream is recoverable and an older request cannot overwrite the retry', async () => {
  const first = streamed(),
    second = streamed();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response),
  );
  const { result } = renderHook(() => useAsk('project'));
  act(() => {
    void result.current.ask('First');
  });
  act(() => {
    void result.current.ask('Second');
  });
  act(() => {
    second.send({ type: 'token', text: 'Partial answer' });
    second.end();
  });
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.error?.message).toMatch(/stream ended early/i);
  await act(async () => {
    first.send({
      type: 'done',
      answer: { markdown: 'First.', citations: [], searched: [], found: true },
    });
    first.end();
  });
  expect(result.current.text).toBe('Partial answer');
  expect(result.current.answer).toBeUndefined();
});
