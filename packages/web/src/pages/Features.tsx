import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { ids, Lang, type FeatureListItemDTO } from '@/api/contract';
import { useFeatures, useProject, useSettings } from '@/api/hooks/queries';
import { ErrorCard } from '@/components/ErrorCard';
import { PageSkeleton } from '@/components/Skeleton';
import { NoAIBanner } from '@/components/NoAIBanner';
import { EmptyState } from '@/components/EmptyState';
import { Markdown } from '@/components/Markdown';
import { FeatureDot } from '@/components/FeatureDot';
import { t } from '@/i18n/t';

export function Features() {
  const { pid } = useParams();
  const project = useProject(pid).data;
  const settings = useSettings().data;
  const [params] = useSearchParams();
  const lang = Lang.safeParse(params.get('lang')).data;
  const query = useFeatures(pid, lang ?? project?.outputLanguage);
  if (query.isLoading) return <PageSkeleton />;
  if (query.error) return <ErrorCard error={query.error} onRetry={() => void query.refetch()} />;
  const groups = new Map<string, FeatureListItemDTO[]>();
  const sharedId = ids.feature('shared');
  const items = [...(query.data ?? [])].sort(
    (a, b) =>
      Number(a.id === sharedId) - Number(b.id === sharedId) ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name),
  );
  for (const item of items) {
    const key = item.id === sharedId ? t('features.shared') : item.category;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return (
    <article data-testid="page-features" className="mx-auto max-w-5xl space-y-8 px-6 py-9">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.features')}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{t('features.intro')}</p>
      </header>
      {(project?.aiStatus === 'none' || project?.aiStatus === 'skipped') &&
        (settings?.provider && project.lastRunId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--surface-2)] p-4 text-sm">
            <span>{t('features.structure')}</span>
            <Link
              to={`/p/${pid}/indexing`}
              state={{ reviewExisting: true }}
              className="font-medium text-[var(--accent)]"
            >
              {t('features.review')}
            </Link>
          </div>
        ) : (
          <NoAIBanner context="features" />
        ))}
      {items.length === 0 && (
        <EmptyState
          title={t('features.empty')}
          body={t('features.explore')}
          action={<Link to={`/p/${pid}/explorer`}>{t('common.openInExplorer')}</Link>}
        />
      )}
      {Array.from(groups, ([category, rows]) => (
        <section
          key={category}
          className="grid gap-2 border-t border-[var(--border)] pt-4 md:grid-cols-[9rem_1fr]"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {category}
          </h2>
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((f) => (
              <li
                key={f.id}
                data-testid="feature-row"
                className="relative rounded px-2 pb-4 pt-2 hover:bg-[var(--surface-2)]"
              >
                <Link
                  to={`/p/${pid}/features/${encodeURIComponent(f.id)}${lang ? `?lang=${lang}` : ''}`}
                  className="flex items-center gap-2 font-semibold after:absolute after:inset-0"
                >
                  <FeatureDot colorIndex={f.colorIndex} />
                  {f.name}
                  <ArrowUpRight className="ml-auto h-4 w-4 text-[var(--text-muted)]" />
                </Link>
                <Markdown text={f.summary} className="mt-1 max-w-prose" />
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {t('features.counts', {
                    members: f.memberCount,
                    entries: f.entryPointCount,
                    flags: f.flagCount,
                  })}
                  {f.changeabilityRating && (
                    <>
                      {' '}
                      · {t('features.changeRating', { level: t(`level.${f.changeabilityRating}`) })}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
