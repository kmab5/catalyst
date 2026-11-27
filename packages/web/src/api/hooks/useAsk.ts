import { useCallback, useEffect, useRef, useState } from 'react';
import { api, reportServerGone } from '../client';
import { AskEvent, ErrorBody, type AskAnswer, type AskRequest, type Lang } from '../contract';
import { ApiError } from '../errors';
import { readSseStream } from '../sse';
import { fetchWithToken } from '../token';
import { t } from '@/i18n/t';

export function useAsk(pid: string | undefined) {
  const [trace, setTrace] = useState<AskEvent[]>([]);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<AskAnswer>();
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState<ApiError>();
  const active = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [pid],
  );
  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setStatus((s) => (s === 'streaming' ? 'idle' : s));
  }, []);

  const ask = useCallback(
    async (question: string, history?: AskRequest['history'], lang?: Lang) => {
      if (!pid || !question.trim()) return;
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      setTrace([]);
      setText('');
      setAnswer(undefined);
      setError(undefined);
      setStatus('streaming');
      const headers = new Headers({ 'Content-Type': 'application/json' });
      let responseReceived = false;
      try {
        const res = await fetchWithToken(api.urls.ask(pid), {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({ question, history, lang }),
        });
        responseReceived = true;
        if (!res.ok) {
          const body = ErrorBody.safeParse(await res.json().catch(() => null));
          throw body.success
            ? new ApiError(
                body.data.error.code,
                res.status,
                body.data.error.message,
                body.data.error.details,
              )
            : new ApiError('INTERNAL', res.status, res.statusText);
        }
        let finished = false;
        await readSseStream(res, (frame) => {
          if (active.current !== controller || finished) return;
          const event = AskEvent.parse(JSON.parse(frame.data));
          switch (event.type) {
            case 'thinking':
            case 'tool':
              setTrace((prev) => [...prev, event]);
              break;
            case 'token':
              setText((prev) => prev + event.text);
              break;
            case 'done':
              finished = true;
              setAnswer(event.answer);
              setText(event.answer.markdown);
              setStatus('done');
              break;
            case 'error':
              throw new ApiError('PROVIDER_ERROR', 502, event.message);
          }
        });
        if (!finished) throw new ApiError('INTERNAL', 500, t('ask.interrupted'));
      } catch (cause) {
        if (active.current !== controller) return;
        if (!responseReceived) reportServerGone();
        setError(
          cause instanceof ApiError
            ? cause
            : new ApiError(
                responseReceived ? 'INTERNAL' : 'SERVER_GONE',
                responseReceived ? 500 : 0,
                cause instanceof Error ? cause.message : t('ask.interrupted'),
              ),
        );
        setStatus('error');
      } finally {
        if (active.current === controller) active.current = null;
      }
    },
    [pid],
  );
  return { ask, trace, text, answer, status, error, cancel };
}
