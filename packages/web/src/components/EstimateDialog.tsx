import type { Lang } from '@/api/contract';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ErrorCard } from './ErrorCard';
import { t } from '@/i18n/t';

export function EstimateDialog({
  pid,
  language,
  onContinue,
  onCancel,
  pending,
}: {
  pid: string;
  language?: Lang;
  onContinue: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const estimate = useQuery({
    queryKey: ['estimate', pid, language],
    queryFn: () => api.index.estimate(pid, language),
    staleTime: 0,
  });
  return (
    <section
      role="dialog"
      aria-labelledby="estimate-title"
      className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <h2 id="estimate-title" className="font-semibold">
        {t('estimate.title')}
      </h2>
      {estimate.isPending && <p role="status">{t('common.loading')}</p>}
      {estimate.error && (
        <ErrorCard error={estimate.error} onRetry={() => void estimate.refetch()} />
      )}
      {estimate.data && (
        <div className="space-y-1 text-sm">
          <p>
            {t('estimate.calls', { count: estimate.data.llmCalls })}
            {estimate.data.costUsd !== null &&
              ' · ' + t('estimate.cost', { cost: estimate.data.costUsd.toFixed(2) })}
          </p>
          <p className="text-[var(--text-muted)]">
            {[estimate.data.model.fast, estimate.data.note].filter(Boolean).join(' · ')}
          </p>
        </div>
      )}
      <div className="flex gap-2 text-sm">
        <button
          disabled={pending || !estimate.data}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-white disabled:opacity-50"
          onClick={onContinue}
        >
          {t('banner.continue')}
        </button>
        <button
          disabled={pending}
          className="rounded border border-[var(--border)] px-3 py-1.5"
          onClick={onCancel}
        >
          {t('common.cancel')}
        </button>
      </div>
    </section>
  );
}
