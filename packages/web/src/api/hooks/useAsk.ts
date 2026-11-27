import { useCallback, useRef, useState } from 'react';
import { api } from '../client';
import { AskAnswer, AskEvent, ErrorBody, type AskRequest, type Lang } from '../contract';
import { ApiError } from '../errors';
import { readSseStream } from '../sse';
import { getToken } from '../token';

export function useAsk(pid: string | undefined) {
  const [trace, setTrace] = useState<AskEvent[]>([]);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<AskAnswer | undefined>(undefined);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((s) => (s === 'streaming' ? 'idle' : s));
  }, []);

  const ask = useCallback(
    async (question: string, history?: AskRequest['history'], lang?: Lang) => {
      if (!pid || !question.trim()) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setTrace([]);
      setText('');
      setAnswer(undefined);
      setError(undefined);
      setStatus('streaming');

      const headers = new Headers({ 'Content-Type': 'application/json' });
      const tok = getToken();
      if (tok) headers.set('X-Catalyst-Token', tok);

      let res: Response;
      try {
        res = await fetch(api.urls.ask(pid), {
          method: 'POST',
          headers,
          body: JSON.stringify({ question, history, lang }),
          signal: controller.signal,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(
          new ApiError(
            'SERVER_GONE',
            0,
            err instanceof Error ? err.message : 'Network error',
          ),
        );
        setStatus('error');
        return;
      }

      if (!res.ok) {
        let parsed: ErrorBody | null = null;
        try {
          const check = ErrorBody.safeParse(await res.json());
          if (check.success) parsed = check.data;
        } catch {
          // ignore
        }
        setError(
          parsed
            ? new ApiError(
                parsed.error.code,
                res.status,
                parsed.error.message,
                parsed.error.details,
              )
            : new ApiError('INTERNAL', res.status, res.statusText || 'Ask failed'),
        );
        setStatus('error');
        return;
      }

      try {
        await readSseStream(res, (frame) => {
          const ev = AskEvent.parse(JSON.parse(frame.data));
          if (ev.type === 'thinking' || ev.type === 'tool') {
            setTrace((prev) => [...prev, ev]);
          } else if (ev.type === 'token') {
            setText((prev) => prev + ev.text);
          } else if (ev.type === 'done') {
            setAnswer(ev.answer);
            setText(ev.answer.markdown);
            setStatus('done');
          } else if (ev.type === 'error') {
            setError(new ApiError('PROVIDER_ERROR', 502, ev.message));
            setStatus('error');
          }
        });
        setStatus((s) => (s === 'streaming' ? 'done' : s));
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(
          new ApiError(
            'INTERNAL',
            500,
            err instanceof Error ? err.message : 'Stream error',
          ),
        );
        setStatus('error');
      }
    },
    [pid],
  );

  return { ask, trace, text, answer, status, error, cancel };
}
