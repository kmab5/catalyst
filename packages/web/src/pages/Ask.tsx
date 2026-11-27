import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation, useOutletContext, useParams, useSearchParams } from 'react-router';
import { Lang } from '@/api/contract';
import { useProject, useSettings } from '@/api/hooks/queries';
import { useAsk } from '@/api/hooks/useAsk';
import { Markdown } from '@/components/Markdown';
import { ErrorCard } from '@/components/ErrorCard';
import { NoAIBanner } from '@/components/NoAIBanner';
import { PageSkeleton } from '@/components/Skeleton';
import type { PaletteContext } from '@/shell/palette-context';
import { t } from '@/i18n/t';
import { AskAnswerView } from './ask/AskAnswerView';
import { AskTrace } from './ask/AskTrace';
import { SuggestedQuestions } from './ask/SuggestedQuestions';

const XRayPanel = lazy(() =>
  import('./explorer/XRayPanel').then((m) => ({ default: m.XRayPanel })),
);
function SourceSheet({ id, close }: { id: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={t('ask.sourceSheet')}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-full w-[min(32rem,96vw)] max-w-full bg-[var(--surface)] text-[var(--text)] backdrop:bg-black/30"
    >
      <div className="min-h-full">
        <button
          type="button"
          onClick={close}
          className="sticky top-0 z-10 block w-full border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-right text-xs text-[var(--accent)]"
        >
          {t('ask.close')}
        </button>
        <Suspense fallback={<PageSkeleton />}>
          <XRayPanel nodeId={id} />
        </Suspense>
      </div>
    </dialog>
  );
}

function Conversation({ pid }: { pid: string }) {
  const { openPalette } = useOutletContext<PaletteContext>();
  const [search] = useSearchParams();
  const location = useLocation();
  const project = useProject(pid).data;
  const settings = useSettings().data;
  const session = useAsk(pid);
  const [draft, setDraft] = useState('');
  const { question, past, ask } = session;
  const [source, setSource] = useState<string>();
  const noAi = settings?.provider === null || session.error?.code === 'AI_NOT_CONFIGURED';
  const lang = Lang.safeParse(search.get('lang')).data ?? project?.outputLanguage;
  const start = (text: string) => {
    setDraft('');
    setSource(undefined);
    void ask(text, lang);
  };
  const q = search.get('q')?.trim() ?? '';
  useEffect(() => {
    if (q) void ask(q, lang, location.key);
  }, [ask, q, lang, location.key]);
  return (
    <article data-testid="page-ask" className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.ask')}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{t('ask.intro')}</p>
      </header>
      {past.map((turn, i) => (
        <section key={i} className="space-y-3 border-t border-[var(--border)] pt-5">
          <h2 className="text-lg font-semibold">{turn.question}</h2>
          <AskTrace events={turn.trace} streaming={false} />
          <AskAnswerView answer={turn.answer} onSource={setSource} />
        </section>
      ))}
      {question && (
        <section aria-live="polite" className="space-y-3 border-t border-[var(--border)] pt-5">
          <h2 className="text-lg font-semibold">{question}</h2>
          <AskTrace events={session.trace} streaming={session.status === 'streaming'} />
          {session.answer ? (
            <AskAnswerView answer={session.answer} onSource={setSource} />
          ) : session.text ? (
            <Markdown text={session.text} />
          ) : (
            session.status === 'streaming' && (
              <p className="text-sm text-[var(--text-muted)]">{t('ask.thinking')}</p>
            )
          )}
          {session.error && !noAi && (
            <ErrorCard error={session.error} onRetry={() => start(question)} />
          )}
        </section>
      )}
      {noAi ? (
        <>
          <NoAIBanner context="ask" />
          <button
            className="text-sm font-medium text-[var(--accent)]"
            onClick={() => openPalette(question || draft)}
          >
            {t('ask.searchInstead')}
          </button>
        </>
      ) : (
        <>
          <form
            className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (session.status !== 'streaming') start(draft);
            }}
          >
            <label className="flex-1">
              <span className="sr-only">{t('ask.question')}</span>
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (session.status !== 'streaming') start(draft);
                  }
                }}
                placeholder={t(question ? 'ask.followup' : 'ask.question')}
                className="w-full resize-y bg-transparent px-2 py-1 text-sm"
              />
            </label>
            {session.status === 'streaming' ? (
              <button
                type="button"
                onClick={session.cancel}
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                {t('ask.stop')}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {t('ask.submit')}
              </button>
            )}
          </form>
          {!question && <SuggestedQuestions pid={pid} onAsk={start} />}
        </>
      )}
      {source && <SourceSheet id={source} close={() => setSource(undefined)} />}
    </article>
  );
}

export function Ask() {
  const { pid } = useParams();
  return pid ? <Conversation key={pid} pid={pid} /> : null;
}
