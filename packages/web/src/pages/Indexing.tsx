import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '@/api/client';
import {
  useOverview,
  useProject,
  useProvidersDetect,
  useSettings,
} from '@/api/hooks/queries';
import { useRunEvents } from '@/api/hooks/useRunEvents';
import { SseProgress } from '@/components/SseProgress';
import { ErrorCard } from '@/components/ErrorCard';
import { t } from '@/i18n/t';

export function Indexing() {
  const { pid } = useParams<{ pid: string }>();
  const navigate = useNavigate();

  const { data: project } = useProject(pid);
  const { data: settings } = useSettings();
  const { data: detected } = useProvidersDetect();
  const [runId, setRunId] = useState<string | null>(null);
  const [startError, setStartError] = useState<unknown>(null);

  const effectiveRunId = runId ?? project?.activeRunId ?? project?.lastRunId ?? null;
  const { events, last, status } = useRunEvents(pid, effectiveRunId);
  const { data: overview } = useOverview(pid);

  const hasDegraded = events.some((e) => e.degraded);
  const inAiPhase = events.some((e) =>
    ['summarize', 'rollup', 'features', 'overview', 'changeability'].includes(e.stage),
  );
  const noProvider = settings && settings.provider === null;

  useEffect(() => {
    if (status === 'done' && pid) {
      const timer = window.setTimeout(() => {
        navigate(`/p/${pid}/overview`);
      }, 600);
      return () => window.clearTimeout(timer);
    }
  }, [status, pid, navigate]);

  async function startRun(ai: boolean) {
    if (!pid) return;
    setStartError(null);
    try {
      const res = await api.index.start(pid, { ai });
      setRunId(res.runId);
    } catch (err) {
      setStartError(err);
    }
  }

  async function handleCancel() {
    if (!pid) return;
    if (effectiveRunId) {
      await api.index.cancel(pid, effectiveRunId).catch(() => undefined);
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
              <h2 className="text-sm font-semibold">Connect AI for plain-English explanations</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {detected?.claudeCli.found
                  ? 'Claude Code CLI was detected on your machine, or choose a provider in Settings.'
                  : 'No AI provider configured yet. You can connect one now or inspect structure only.'}
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
            onClick={() => void startRun(false)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg)]"
          >
            Skip (structure only)
          </button>
        </div>
      )}

      {startError ? (
        <ErrorCard error={startError} onRetry={() => void startRun(true)} />
      ) : null}

      {status === 'error' && last?.message && (
        <ErrorCard
          error={new Error(last.message)}
          onRetry={() => void startRun(true)}
        />
      )}

      <SseProgress
        events={events}
        stackNames={overview?.stack.map((s) => s.name) ?? []}
        includeAi={!noProvider}
      />

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
    </div>
  );
}
