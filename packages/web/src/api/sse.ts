import { createParser } from 'eventsource-parser';

export interface SseFrame {
  event: string;
  id?: string;
  data: string;
}

export async function readSseStream(
  response: Response,
  onFrame: (frame: SseFrame) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error('SSE response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createParser({
    onEvent(ev) {
      onFrame({
        event: ev.event ?? 'message',
        id: ev.id,
        data: ev.data,
      });
    },
  });

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}
