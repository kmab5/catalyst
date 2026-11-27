import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { publicError } from './errors.js';

interface Frame { event: string; data: unknown; id?: string }

/** Read the first Ask item before committing headers so setup errors retain their HTTP status. */
export function sendEvents<T>(c: Context, iterator: AsyncIterator<T>, frame: (item: T) => Frame,
  controller: AbortController, first?: IteratorResult<T>) {
  return streamSSE(c, async stream => {
    let end!: () => void;
    const aborted = new Promise<undefined>(resolve => { end = () => resolve(undefined); });
    const abort = () => { end(); controller.abort(); };
    stream.onAbort(abort);
    c.req.raw.signal.addEventListener('abort', abort, { once: true });
    if (c.req.raw.signal.aborted || stream.aborted) abort();
    const ping = setInterval(() => { void stream.write(': ping\n\n'); }, 15_000);
    ping.unref();
    try {
      let next = first ?? await Promise.race([iterator.next(), aborted]);
      while (next && !next.done && !controller.signal.aborted) {
        const item = frame(next.value);
        await stream.writeSSE({ event: item.event, id: item.id, data: JSON.stringify(item.data) });
        if (['done','error','cancelled'].includes(item.event)) break;
        next = await Promise.race([iterator.next(), aborted]);
      }
    } catch (error) {
      if (!controller.signal.aborted) await stream.writeSSE({ event: 'error', data: JSON.stringify({ type: 'error', message: publicError(error).body.error.message }) });
    } finally {
      clearInterval(ping);
      c.req.raw.signal.removeEventListener('abort', abort);
      void iterator.return?.().catch(() => {});
    }
  });
}
