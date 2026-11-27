import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { api } from '@/api/client';
import { useOverview, useProject, useProvidersDetect, useSettings } from '@/api/hooks/queries';
import { useRunEvents } from '@/api/hooks/useRunEvents';
import { EstimateDialog } from '@/components/EstimateDialog';
import { SseProgress } from '@/components/SseProgress';
import { ErrorCard } from '@/components/ErrorCard';
import { t } from '@/i18n/t';

export function Indexing() {
  const { pid } = useParams<{ pid: string }>();
  return pid ? <ProjectIndexing key={pid} pid={pid} /> : null;
}

function ProjectIndexing({ pid }: { pid: string }) {
  const navigate = useNavigate();

  const { data: project } = useProject(pid);
  const { data: settings } = useSettings();
  const { data: detected } = useProvidersDetect();
  const location = useLocation();
  const requestedLanguage = location.state?.language;
  const language =
    requestedLanguage === 'tr' || requestedLanguage === 'en' ? requestedLanguage : undefined;
  const runId: string | undefined = location.state?.runId;
  const [starting, setStarting] = useState(false);
  const reviewExisting = Boolean(location.state?.reviewExisting) && !project?.activeRunId;
  const reviewEstimate = Boolean(location.state?.reviewEstimate);
  const [failure, setFailure] = useState<{ error: unknown; retry: () => void }>();

  const effectiveRunId = reviewExisting
    ? null
    : (runId ?? project?.activeRunId ?? project?.lastRunId ?? null);
  const { events, last, status } = useRunEvents(pid, effectiveRunId);
  const { data: overview } = useOverview(pid);

  const hasDegraded = events.some((e) => e.degraded);
  const inAiPhase = events.some((e) =>
    ['summarize', 'rollup', 'features', 'overview', 'changeability'].includes(e.stage),
  );
  const noProvider = settings && settings.provider === null;

  useEffect(() => {
    if (
      status === 'done' &&
      pid &&
      last?.runId === effectiveRunId &&
      (!reviewEstimate || noProvider || last.stage === 'cancelled')
    ) {
      const timer = window.setTimeout(() => {
        navigate(`/p/${pid}/overview`);
      }, 600);
      return () => window.clearTimeout(timer);
    }
  }, [status, pid, navigate, reviewEstimate, noProvider, last, effectiveRunId]);

  async function startRun(ai: boolean, estimateAfter = false) {
    if (!pid || starting) return;
    setStarting(true);
    setFailure(undefined);
    try {
      const res = await api.index.start(pid, { ai, language });
      navigate(location.pathname, {
        replace: true,
        state: { runId: res.runId, reviewEstimate: estimateAfter },
      });
    } catch (err) {
      setFailure({ error: err, retry: () => void startRun(ai, estimateAfter) });
    } finally {
      setStarting(false);
    }
  }

  async function handleCancel() {
    if (!pid) return;
    if (effectiveRunId && status === 'open') {
      try {
        await api.index.cancel(pid, effectiveRunId);
      } catch (error) {
        setFailure({ error, retry: () => void handleCancel() });
        return;
      }
    }
    navigate(`/p/${pid}/overview`);
  }

  return (
    <div data-testid="page-indexing" className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('indexing.title', { name: project?.name ?? 'project' })}
        </h1>
        <p className="text-sm text-[var(--text-muted)]">{t('indexing.subtitle')}</p>
      </header>

      {hasDegraded && (
        <div
          role="status"
          className="rounded-lg border border-[var(--sev-warn)]/40 bg-[var(--sev-warn-soft)] px-4 py-3 text-xs text-[var(--text)]"
        >
          {t('banner.degraded')}
        </div>
      )}

      {noProvider && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{t('indexing.connect')}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {detected?.claudeCli.found
                  ? t('indexing.claudeDetected')
                  : t('indexing.noProvider')}
              </p>
            </div>
            <Link
              to="/settings"
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white shrink-0"
            >
              {t('banner.connectAi')}
            </Link>
          </div>
          <button
            type="button"
            disabled={starting}
            onClick={() => (effectiveRunId ? navigate(`/p/${pid}/overview`) : void startRun(false))}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg)]"
          >
            {t('indexing.structureOnly')}
          </button>
        </div>
      )}

      {(reviewExisting || (reviewEstimate && status === 'done' && last?.stage === 'done')) &&
        settings?.provider && (
          <EstimateDialog
            pid={pid}
            language={language}
            pending={starting}
            onContinue={() => void startRun(true)}
            onCancel={() => navigate(`/p/${pid}/overview`)}
          />
        )}
      {failure && <ErrorCard error={failure.error} onRetry={failure.retry} />}
      {!reviewExisting && !effectiveRunId && project && settings?.provider && (
        <button
          type="button"
          disabled={starting}
          onClick={() => void startRun(false, true)}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
        >
          {t('indexing.start')}
        </button>
      )}

      {status === 'error' && (
        <ErrorCard
          error={new Error(last?.message ?? t('indexing.interrupted'))}
          onRetry={() => void startRun(true)}
        />
      )}

      {!reviewExisting && (
        <SseProgress
          events={events}
          stackNames={overview?.stack.map((s) => s.name) ?? []}
          includeAi={!noProvider && !reviewEstimate}
        />
      )}

      {effectiveRunId && status === 'open' && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => void handleCancel()}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
          >
            {t('common.cancel')}
          </button>

          {inAiPhase && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
            >
              {t('indexing.skipAi')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
