import { useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, reportServerGone } from '../client';
import { AskEvent, ErrorBody, type AskAnswer, type AskRequest, type Lang } from '../contract';
import { ApiError } from '../errors';
import { readSseStream } from '../sse';
import { fetchWithToken } from '../token';
import { t } from '@/i18n/t';

interface Turn {
  question: string;
  answer: AskAnswer;
  trace: AskEvent[];
}

interface Conversation {
  question: string;
  past: Turn[];
  trace: AskEvent[];
  text: string;
  answer?: AskAnswer;
  error?: ApiError;
  status: 'idle' | 'streaming' | 'done' | 'error';
}

function createSession(pid: string) {
  let state: Conversation = { question: '', past: [], trace: [], text: '', status: 'idle' };
  let active: AbortController | undefined;
  const listeners = new Set<() => void>();
  const consumedLinks = new Set<string>();
  function update(change: Partial<Conversation>) {
    state = { ...state, ...change };
    listeners.forEach((notify) => notify());
  }

  async function ask(question: string, lang?: Lang, linkKey?: string) {
    question = question.trim();
    if (!question) return;
    if (linkKey !== undefined) {
      if (consumedLinks.has(linkKey)) return;
      consumedLinks.add(linkKey);
      if (state.question === question) return;
    }
    if (state.status === 'streaming' && state.question === question) return;
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const past = state.answer
      ? [...state.past, { question: state.question, answer: state.answer, trace: state.trace }]
      : state.past;
    const history: AskRequest['history'] = past
      .flatMap((turn) => [
        { role: 'user' as const, content: turn.question },
        { role: 'assistant' as const, content: turn.answer.markdown },
      ])
      .slice(-6);
    update({
      question, past, trace: [], text: '',
      answer: undefined, error: undefined, status: 'streaming',
    });
    let responseReceived = false;
    try {
      const res = await fetchWithToken(api.urls.ask(pid), {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
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
        if (active !== controller || finished) return;
        const event = AskEvent.parse(JSON.parse(frame.data));
        switch (event.type) {
          case 'thinking':
          case 'tool':
            update({ trace: [...state.trace, event] });
            break;
          case 'token':
            update({ text: state.text + event.text });
            break;
          case 'done':
            finished = true;
            update({ answer: event.answer, text: event.answer.markdown, status: 'done' });
            break;
          case 'error':
            throw new ApiError('PROVIDER_ERROR', 502, event.message);
        }
      });
      if (!finished) throw new ApiError('INTERNAL', 500, t('ask.interrupted'));
    } catch (cause) {
      if (active !== controller) return;
      if (!responseReceived) reportServerGone();
      const error = cause instanceof ApiError
        ? cause
        : new ApiError(
            responseReceived ? 'INTERNAL' : 'SERVER_GONE',
            responseReceived ? 500 : 0,
            cause instanceof Error ? cause.message : t('ask.interrupted'),
          );
      update({ error, status: 'error' });
    } finally {
      if (active === controller) active = undefined;
    }
  }
  return {
    subscribe(notify: () => void) {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    snapshot: () => state,
    ask,
    cancel() {
      if (state.status !== 'streaming') return;
      active?.abort();
      active = undefined;
      update({ status: 'idle' });
    },
  };
}

// Scope conversations to the running app so route changes only detach the view.
const sessions = new WeakMap<QueryClient, Map<string, ReturnType<typeof createSession>>>();

export function useAsk(pid: string) {
  const client = useQueryClient();
  let projects = sessions.get(client);
  if (!projects) {
    projects = new Map();
    sessions.set(client, projects);
  }
  let session = projects.get(pid);
  if (!session) {
    session = createSession(pid);
    projects.set(pid, session);
  }
  const snapshot = useSyncExternalStore(session.subscribe, session.snapshot);
  return { ...snapshot, ask: session.ask, cancel: session.cancel };
}
