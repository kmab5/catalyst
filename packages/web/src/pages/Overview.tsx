import { ids } from '@/api/contract';
import { t } from '@/i18n/t';
import { NodeIdLink } from '@/components/NodeIdLink';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useOverview } from '@/api/hooks/queries';
import { PageSkeleton } from '@/components/Skeleton';
import { ErrorCard } from '@/components/ErrorCard';
import { NoAIBanner } from '@/components/NoAIBanner';
import { FeatureDot } from '@/components/FeatureDot';
import { NodeLink } from '@/components/NodeLink';
import { FlagBadge } from '@/components/FlagBadge';
import { Markdown } from '@/components/Markdown';

export function Overview() {
  const { pid } = useParams<{ pid: string }>();
  const { data, isLoading, error, refetch } = useOverview(pid);
  const [openStack, setOpenStack] = useState<string | null>(null);

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="p-8 max-w-4xl">
        <ErrorCard error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data) return null;

  const { overview, stack, features, entryPoints, health, project } = data;
  const visibleFeatures = [...features].sort((a, b) => {
    return Number(a.id === ids.feature('shared')) - Number(b.id === ids.feature('shared'));
  });

  const evidenceRefs = entryPoints;

  return (
    <div data-testid="page-overview" className="mx-auto max-w-4xl px-8 py-8 space-y-10">
      <header className="space-y-4">
        <div className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
          {project.name}
        </div>
        {overview ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight leading-snug text-[var(--text)]">
              {overview.oneLiner}
            </h1>
            <div className="prose-measure text-sm text-[var(--text-muted)] whitespace-pre-line">
              <Markdown text={overview.description} citations={evidenceRefs} resolveCitations />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold">{project.name}</h1>
            <NoAIBanner context="overview" />
          </>
        )}
      </header>

      {stack.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {t('overview.stack')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {stack.map((item) => {
              const isOpen = openStack === item.name;
              return (
                <div key={item.name} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenStack(isOpen ? null : item.name)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:border-[var(--text-muted)]"
                  >
                    <span>{item.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{item.category}</span>
                  </button>
                  {isOpen && item.evidence.length > 0 && (
                    <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-md space-y-1">
                      <div className="text-[11px] font-medium text-[var(--text-muted)]">
                        {t('overview.evidence')}
                      </div>
                      {item.evidence.map((ev) => (
                        <div key={ev} className="truncate">
                          <NodeIdLink id={ev} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {overview && visibleFeatures.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t('overview.features')}
            </h2>
            <Link
              to={`/p/${pid}/features`}
              className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
            >
              <span>{t('overview.allFeatures')}</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {visibleFeatures.map((f) => (
              <Link
                key={f.id}
                to={`/p/${pid}/features/${encodeURIComponent(f.id)}`}
                data-testid="feature-card"
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <FeatureDot colorIndex={f.colorIndex} className="mt-1.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--text)]">{f.name}</div>
                    <div className="text-xs text-[var(--text-muted)] truncate max-w-xl">
                      {f.summary}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] shrink-0">
                  <span>{t('overview.members', { count: f.memberCount })}</span>
                  {f.changeabilityRating && (
                    <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 capitalize">
                      {f.changeabilityRating}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {overview?.architecture && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {t('overview.architecture')}
          </h2>
          <Markdown text={overview.architecture} citations={evidenceRefs} resolveCitations />
        </section>
      )}

      {entryPoints.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {t('overview.entries')}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {entryPoints.map((ep) => (
              <NodeLink key={ep.id} node={ep} />
            ))}
          </div>
        </section>
      )}

      {overview && overview.gaps.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {t('overview.gaps')}
          </h2>
          <ul className="space-y-1.5">
            {overview.gaps.map((gap) => (
              <li key={gap} className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--sev-warn)] shrink-0" />
                <Markdown text={gap} citations={evidenceRefs} resolveCitations />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 border-t border-[var(--border)] pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {t('overview.health')}
          </h2>
          <Link
            to={`/p/${pid}/health`}
            className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            <span>{t('overview.openHealth')}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-sm text-[var(--text)]">
          {t('overview.healthCounts', { high: health.high, warn: health.warn, info: health.info })}
        </p>
        {health.topFlags.length > 0 && (
          <ul className="space-y-1.5">
            {health.topFlags.slice(0, 3).map((flag) => (
              <li key={flag.id} className="flex items-start gap-2 text-xs">
                <FlagBadge severity={flag.severity} rule={flag.rule} className="shrink-0" />
                <span className="text-[var(--text-muted)]">{flag.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
