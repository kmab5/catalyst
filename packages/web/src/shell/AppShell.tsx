import { useCallback, useState } from 'react';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router';
import { useHealth, useProject, useSettings, useStartIndex } from '@/api/hooks/queries';
import { useRunEvents } from '@/api/hooks/useRunEvents';
import { CommandPalette } from '@/components/CommandPalette';
import { StatusPill } from '@/components/StatusPill';
import { EmptyState } from '@/components/EmptyState';
import { ErrorCard } from '@/components/ErrorCard';
import { t } from '@/i18n/t';
import { TopBar } from './TopBar';
import { LeftNav } from './LeftNav';
import { ServerGoneBanner } from './ServerGoneBanner';
import { StaleToast } from './StaleToast';
import { PartialAiStrip } from './PartialAiStrip';
import { useNavShortcuts } from './useNavShortcuts';

export function AppShell() {
  const { pid } = useParams();
  const [palette, setPalette] = useState<{ pid: string; query: string } | null>(null);
  const openPalette = useCallback(
    (query = '') => {
      if (pid) setPalette({ pid, query });
    },
    [pid],
  );
  const toggle = useCallback(() => {
    if (pid) setPalette((value) => (value?.pid === pid ? null : { pid, query: '' }));
  }, [pid]);
  useNavShortcuts(pid, toggle);
  const projectQuery = useProject(pid);
  const project = projectQuery.data;
  const settings = useSettings().data;
  const health = useHealth(project?.lastRunId ? pid : undefined);
  const navigate = useNavigate();
  const onIndexing = Boolean(useMatch('/p/:pid/indexing'));
  const run = useRunEvents(pid, onIndexing ? undefined : project?.activeRunId);
  const start = useStartIndex(pid ?? '');
  const beginIndex = (resumeAi: boolean) => {
    if (!pid || start.isPending) return;
    if (!resumeAi && project?.lastRunId) {
      navigate(`/p/${pid}/indexing`, { state: { reviewExisting: true } });
      return;
    }
    start.mutate(
      { ai: resumeAi },
      {
        onSuccess: ({ runId }) =>
          navigate(`/p/${pid}/indexing`, { state: { runId, reviewEstimate: !resumeAi } }),
      },
    );
  };
  const index = () => beginIndex(false);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <TopBar
        project={project}
        hasProject={Boolean(pid)}
        onReindex={
          !start.isPending &&
          project?.lastRunId &&
          !project.activeRunId &&
          project.status !== 'indexing'
            ? index
            : undefined
        }
        onOpenPalette={() => openPalette()}
        statusSlot={
          project && <StatusPill project={project} progress={run.last} onReindex={index} />
        }
      />
      <ServerGoneBanner />
      {pid && <StaleToast key={pid} pid={pid} project={project} onReindex={index} />}
      {project?.aiStatus === 'partial' && project.status !== 'indexing' && (
        <PartialAiStrip disabled={start.isPending} onContinue={() => beginIndex(true)} />
      )}
      <div className="workspace-layout flex min-h-0 flex-1">
        {pid && (
          <LeftNav
            pid={pid}
            highFlagCount={health.data?.summary.high}
            providerLabel={settings?.provider?.type}
          />
        )}
        <main className="min-w-0 flex-1 overflow-auto">
          {start.error && <ErrorCard error={start.error} onRetry={index} />}
          {pid && !project && projectQuery.error ? (
            <ErrorCard error={projectQuery.error} onRetry={() => void projectQuery.refetch()} />
          ) : project?.status === 'never-indexed' && !onIndexing ? (
            <EmptyState
              title={t('shell.noIndex')}
              body={t('shell.noIndexBody')}
              action={
                <button
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
                  disabled={start.isPending}
                  onClick={index}
                >
                  {t('shell.index')}
                </button>
              }
            />
          ) : (
            <Outlet context={{ openPalette }} />
          )}
        </main>
      </div>
      {pid && palette?.pid === pid && (
        <CommandPalette pid={pid} initialQuery={palette.query} onClose={() => setPalette(null)} />
      )}
    </div>
  );
}
