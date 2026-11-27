import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Lang } from '@/api/contract';
import { useFeature, useFeatures, useGraph, useProject } from '@/api/hooks/queries';
import { NodeIdLink } from '@/components/NodeIdLink';
import { FeatureChip } from '@/components/FeatureChip';
import { FeatureDot } from '@/components/FeatureDot';
import { ErrorCard } from '@/components/ErrorCard';
import { PageSkeleton } from '@/components/Skeleton';
import { Markdown } from '@/components/Markdown';
import { t } from '@/i18n/t';
import { FlowSteps } from './features/FlowSteps';
import { ChangeabilityCard } from './features/ChangeabilityCard';
import { MembersByRole } from './features/MembersByRole';

const FlowDiagram = lazy(() => import('./features/FlowDiagram'));

export function FeatureDetail() {
  const [diagram, setDiagram] = useState(false);
  const { pid, fid } = useParams();
  const project = useProject(pid).data;
  const [params] = useSearchParams();
  const lang = Lang.safeParse(params.get('lang')).data ?? project?.outputLanguage;
  const detail = useFeature(pid, fid, lang);
  const listing = useFeatures(pid, lang);
  const graph = useGraph(pid, { level: 'feature' });
  const nodes = useMemo(
    () => new Map(detail.data?.members.map((m) => [m.nodeId, m.node])),
    [detail.data],
  );
  if (detail.isLoading) return <PageSkeleton />;
  if (!detail.data) return <ErrorCard error={detail.error} onRetry={() => void detail.refetch()} />;
  const feature = detail.data;
  const citations = Array.from(nodes.values());
  const features = new Map(listing.data?.map((f) => [f.id, f]));
  const usedBy = [
    ...new Set(
      graph.data?.edges
        .filter(
          (e) => e.target === fid && (e.kind === 'feature_depends' || e.kind === 'depends_on'),
        )
        .map((e) => e.source),
    ),
  ];
  return (
    <article data-testid="page-feature-detail" className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <Link
        to={`/p/${pid}/features`}
        className="flex items-center gap-2 text-sm text-[var(--text-muted)]"
      >
        <ArrowLeft size={14} />
        {t('nav.features')}
      </Link>
      <header className="space-y-3">
        <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
          <FeatureDot colorIndex={features.get(feature.id)?.colorIndex ?? 0} />
          {feature.name}
        </h1>
        <p className="text-xs text-[var(--text-muted)]">
          {t('features.confidence', {
            category: feature.category,
            percent: Math.round(feature.confidence * 100),
          })}
        </p>
        <Markdown text={feature.summary} citations={citations} />
        {feature.description && <Markdown text={feature.description} citations={citations} />}
        <Link
          className="inline-block text-sm text-[var(--accent)] hover:underline"
          to={`/p/${pid}/graph?feature=${encodeURIComponent(feature.id)}`}
        >
          {t('common.showInGraph')}
        </Link>
      </header>
      {feature.entryPoints.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">{t('features.starts')}</h2>
          <div className="mt-2 flex flex-wrap gap-3">
            {feature.entryPoints.map((id) => (
              <NodeIdLink key={id} id={id} node={nodes.get(id)} />
            ))}
          </div>
        </section>
      )}
      {feature.changeability && <ChangeabilityCard card={feature.changeability} nodes={nodes} />}
      {feature.flows.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('features.flows')}</h2>
            <div className="flex rounded-md bg-[var(--surface-2)] p-1">
              {(['listMode', 'diagramMode'] as const).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={diagram === (mode === 'diagramMode')}
                  onClick={() => setDiagram(mode === 'diagramMode')}
                  className="rounded px-3 py-1 text-xs aria-pressed:bg-[var(--surface)]"
                >
                  {t(`features.${mode}`)}
                </button>
              ))}
            </div>
          </div>
          {feature.flows.map((f) =>
            diagram ? (
              <Suspense key={f.id} fallback={<PageSkeleton />}>
                <FlowDiagram flow={f} nodes={nodes} />
              </Suspense>
            ) : (
              <FlowSteps key={f.id} flow={f} nodes={nodes} />
            ),
          )}
        </section>
      )}
      <dl className="space-y-3">
        {(
          [
            ['features.data', feature.dataModels],
            ['features.services', feature.services],
            ['features.depends', feature.dependsOn],
            ['features.users', usedBy],
          ] as const
        ).map(
          ([key, list]) =>
            list.length > 0 && (
              <div key={key} className="grid gap-2 md:grid-cols-[8rem_1fr]">
                <dt className="text-sm font-semibold">{t(key)}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {list.map((id) => {
                    const f = features.get(id);
                    return f ? (
                      <FeatureChip
                        key={id}
                        featureId={id}
                        name={f.name}
                        colorIndex={f.colorIndex}
                      />
                    ) : (
                      <NodeIdLink key={id} id={id} node={nodes.get(id)} />
                    );
                  })}
                </dd>
              </div>
            ),
        )}
      </dl>
      <MembersByRole members={feature.members} />
    </article>
  );
}
