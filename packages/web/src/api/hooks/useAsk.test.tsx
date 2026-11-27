import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useAsk } from './useAsk';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAsk() {
  const client = new QueryClient();
  return renderHook(({ pid }) => useAsk(pid), {
    initialProps: { pid: 'project' },
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

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
  const { result } = renderAsk();
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
  const { result } = renderAsk();
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

test('project switching preserves each session and only explicit cancellation aborts the stream', async () => {
  const first = streamed();
  const retry = streamed();
  const fetch = vi.fn()
    .mockResolvedValueOnce(first.response)
    .mockResolvedValueOnce(retry.response);
  vi.stubGlobal('fetch', fetch);
  const { result, rerender } = renderAsk();
  act(() => {
    void result.current.ask('Where is checkout?');
    void result.current.ask('Where is checkout?');
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const signal = fetch.mock.calls[0]![1].signal as AbortSignal;
  rerender({ pid: 'second' });
  expect(result.current.question).toBe('');
  expect(signal.aborted).toBe(false);
  rerender({ pid: 'project' });
  expect(result.current.question).toBe('Where is checkout?');
  act(() => result.current.cancel());
  expect(signal.aborted).toBe(true);
  expect(result.current.status).toBe('idle');
  act(() => { void result.current.ask('Where is checkout?'); });
  await act(async () => {
    first.end();
    retry.send({
      type: 'done',
      answer: { markdown: 'At checkout.', citations: [], searched: [], found: true },
    });
    retry.end();
  });
  expect(result.current.answer?.markdown).toBe('At checkout.');
  rerender({ pid: 'second' });
  expect(result.current.answer).toBeUndefined();
});
