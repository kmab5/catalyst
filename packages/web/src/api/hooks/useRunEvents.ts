import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { ProgressEvent } from '../contract';

export function useRunEvents(pid: string | undefined, runId: string | null | undefined) {
  const qc = useQueryClient();
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<'open' | 'done' | 'error'>('open');

  useEffect(() => {
    if (!pid || !runId) return;

    setEvents([]);
    setStatus('open');

    let closed = false;
    const url = api.urls.runEvents(pid, runId);

    if (typeof EventSource === 'undefined') {
      return;
    }

    const es = new EventSource(url);

    const handlePayload = (raw: string) => {
      try {
        const parsed = ProgressEvent.parse(JSON.parse(raw));
        setEvents((prev) => [...prev, parsed]);
        if (parsed.stage === 'detect') {
          void qc.invalidateQueries({ queryKey: ['overview', pid] });
        }
        if (parsed.stage === 'done' || parsed.stage === 'cancelled') {
          setStatus('done');
          es.close();
          closed = true;
          void qc.invalidateQueries({
            predicate: (q) => q.queryKey.includes(pid),
          });
          void qc.invalidateQueries({ queryKey: ['projects'] });
        } else if (parsed.stage === 'error') {
          setStatus('error');
          es.close();
          closed = true;
        }
      } catch {
        // ignore malformed frames
      }
    };

    es.addEventListener('progress', (e) => handlePayload((e as MessageEvent).data));
    es.addEventListener('done', (e) => handlePayload((e as MessageEvent).data));
    es.addEventListener('error', (e) => {
      if (e instanceof MessageEvent && e.data) {
        handlePayload(e.data);
      } else if (!closed && es.readyState === EventSource.CLOSED) {
        setStatus('error');
      }
    });
    es.onmessage = (e) => handlePayload(e.data);

    return () => {
      closed = true;
      es.close();
    };
  }, [pid, runId, qc]);

  return {
    events,
    last: events[events.length - 1],
    status,
  };
}
