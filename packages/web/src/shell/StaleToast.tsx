import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectDTO } from '@/api/contract';
import { onIndexHeader } from '@/api/client';
import { t } from '@/i18n/t';

export function StaleToast({
  pid,
  project,
  onReindex,
}: {
  pid: string;
  project?: ProjectDTO;
  onReindex: () => void;
}) {
  const client = useQueryClient();
  const [observedRun, setObservedRun] = useState('');
  useEffect(
    () =>
      onIndexHeader((id, run) => {
        if (id === pid) setObservedRun(run);
      }),
    [pid],
  );
  if (!project || project.status === 'indexing') return null;
  const newIndex = Boolean(observedRun && project.lastRunId && observedRun !== project.lastRunId);
  if (!newIndex && project.status !== 'stale') return null;
  const refresh = () => {
    setObservedRun('');
    void client.invalidateQueries({
      predicate: (q) => q.queryKey[1] === pid || q.queryKey[0] === 'projects',
    });
  };
  return (
    <div
      role="status"
      className="flex justify-center gap-3 border-b border-[var(--border)] bg-[var(--sev-warn-soft)] px-4 py-2 text-sm"
    >
      {newIndex ? (
        <button onClick={refresh} className="font-medium underline">
          {t('banner.staleToast')}
        </button>
      ) : (
        <>
          {t('shell.stale')}
          <button onClick={onReindex} className="font-medium underline">
            {t('shell.reindex')}
          </button>
        </>
      )}
    </div>
  );
}
