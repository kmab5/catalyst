import { useParams, useSearchParams } from 'react-router';
import { Severity } from '@/api/contract';
import { useHealth, useFeatures } from '@/api/hooks/queries';
import { EmptyState } from '@/components/EmptyState';
import { ErrorCard } from '@/components/ErrorCard';
import { PageSkeleton } from '@/components/Skeleton';
import { t } from '@/i18n/t';
import { FlagList } from './health/FlagList';
import { CycleList } from './health/CycleList';
import { MetricsTables } from './health/MetricsTables';

export function Health() {
  const { pid } = useParams();
  const [params, setParams] = useSearchParams();
  const severity = Severity.safeParse(params.get('severity')).data;
  const rule = params.get('rule') || undefined;
  const feature = params.get('feature') || undefined;
  const filtered = Boolean(severity || rule || feature);
  const response = useHealth(pid, filtered ? { severity, rule, feature } : undefined);
  const features = useFeatures(pid).data ?? [];
  const metricsTab = params.get('tab') === 'metrics';
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'tab') next.delete('flag');
    setParams(next);
  };
  const { data } = response;
  return (
    <article data-testid="page-health" className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.health')}</h1>
        {data && (
          <p className="mt-2 text-sm">
            {t('health.intro', { high: data.summary.high, warn: data.summary.warn })}
          </p>
        )}
      </header>
      <div className="flex gap-5 border-b border-[var(--border)]">
        {(['flags', 'metrics'] as const).map((tab) => (
          <button
            key={tab}
            aria-pressed={(tab === 'metrics') === metricsTab}
            className="border-b-2 border-transparent py-2 text-sm aria-pressed:border-[var(--accent)]"
            onClick={() => update('tab', tab === 'metrics' ? tab : '')}
          >
            {t(`health.${tab}`)}
          </button>
        ))}
      </div>
      {!metricsTab && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-md bg-[var(--surface-2)] p-1">
            {(['all', 'high', 'warn', 'info'] as const).map((s) => (
              <button
                key={s}
                onClick={() => update('severity', s === 'all' ? '' : s)}
                aria-pressed={(severity ?? 'all') === s}
                className="rounded px-3 py-1 text-xs font-medium aria-pressed:bg-[var(--surface)] aria-pressed:text-[var(--accent)]"
              >
                {t(`health.${s}`)}
              </button>
            ))}
          </div>
          <select
            aria-label={t('health.featureFilter')}
            value={feature ?? ''}
            onChange={(e) => update('feature', e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
          >
            <option value="">{t('health.allFeatures')}</option>
            {features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {filtered && (
            <button className="text-xs text-[var(--accent)]" onClick={() => setParams({})}>
              {t('health.clear')}
            </button>
          )}
        </div>
      )}
      {response.isLoading ? (
        <PageSkeleton />
      ) : response.error || !data ? (
        <ErrorCard error={response.error} onRetry={() => void response.refetch()} />
      ) : metricsTab ? (
        <MetricsTables metrics={data.metrics} />
      ) : (
        <>
          {!data.flags.length && (
            <EmptyState
              title={t(filtered ? 'health.emptyFilters' : 'health.noIssues')}
              body={t('health.emptyBody')}
            />
          )}
          <FlagList flags={data.flags} selected={params.get('flag')} />
          <CycleList cycles={data.cycles} />
        </>
      )}
    </article>
  );
}
