import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ids, type DiffImpactDTO, type NodeRef } from '@/api/contract';
import { useDiffImpact, useProject } from '@/api/hooks/queries';
import { EmptyState } from '@/components/EmptyState';
import { FlagBadge } from '@/components/FlagBadge';
import { Markdown } from '@/components/Markdown';
import { ErrorCard } from '@/components/ErrorCard';
import { PageSkeleton } from '@/components/Skeleton';
import { NodeLink } from '@/components/NodeLink';
import { t } from '@/i18n/t';

function BaseSelector({ base, compare }: { base?: string; compare: (base: string) => void }) {
  const [customBase, setCustomBase] = useState(Boolean(base));
  const [value, setValue] = useState(base ?? '');
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (customBase && value.trim()) compare(value.trim());
      }}
    >
      <label>
        {t('impact.base')}{' '}
        <select
          value={customBase ? 'ref' : 'working'}
          onChange={(e) => {
            const custom = e.target.value === 'ref';
            setCustomBase(custom);
            if (!custom) compare('');
          }}
          className="ml-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"
        >
          <option value="working">{t('impact.working')}</option>
          <option value="ref">{t('impact.ref')}</option>
        </select>
      </label>
      {customBase && (
        <>
          <input
            aria-label={t('impact.ref')}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="main"
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs"
          />
          <button
            disabled={!value.trim()}
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-white disabled:opacity-50"
          >
            {t('impact.compare')}
          </button>
        </>
      )}
    </form>
  );
}

function graphIds(nodes: NodeRef[]) {
  return [
    ...new Set(
      nodes.flatMap((node) => (node.filePath ? [node.id, ids.file(node.filePath)] : [node.id])),
    ),
  ];
}

function Comparison({ data, pid, base }: { data: DiffImpactDTO; pid: string; base?: string }) {
  if (data.unavailable === 'not-a-work-tree')
    return <EmptyState title={t('impact.noGit')} body={t('impact.noGitBody')} />;
  if (data.unavailable === 'git-not-installed')
    return <EmptyState title={t('impact.gitMissing')} body={t('impact.gitMissingBody')} />;
  if (!data.changedFiles.length)
    return <EmptyState title={t('impact.empty')} body={t('impact.emptyBody')} />;
  const refs = new Map(
    [
      ...data.changedNodes,
      ...data.affected.nodes,
      ...data.affected.routes,
      ...data.flagsTouched.map((f) => f.node),
    ].map((n) => [n.id, n]),
  );
  const graphSearch = new URLSearchParams({ level: 'file', diff: '1' });
  if (base) graphSearch.set('base', base);
  const symbols = data.changedNodes.filter((n) => n.kind === 'symbol');
  return (
    <div className="space-y-7">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('impact.changed')}</h2>
          <Link
            to={`/p/${pid}/graph?${graphSearch}`}
            state={{
              changedIds: graphIds(data.changedNodes),
              affectedIds: graphIds(data.affected.nodes),
            }}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            {t('common.showInGraph')}
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {data.changedFiles.map((f) => {
            const node = refs.get(ids.file(f.path));
            return (
              <li key={f.path} className="flex items-center justify-between gap-3 py-2">
                {node ? (
                  <NodeLink node={node} showPath />
                ) : (
                  <code className="break-all text-xs">{f.path}</code>
                )}
                <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs">
                  {t(`impact.${f.status}`)}
                </span>
              </li>
            );
          })}
        </ul>
        {symbols.length > 0 && (
          <div className="mt-3">
            <h3 className="text-sm font-semibold">{t('impact.symbols')}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {symbols.map((n) => (
                <NodeLink key={n.id} node={n} />
              ))}
            </div>
          </div>
        )}
      </section>
      {data.affected.features.length > 0 && (
        <section aria-labelledby="affected-features">
          <h2 id="affected-features" className="text-lg font-semibold">
            {t('impact.features')}
          </h2>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {data.affected.features.map((f) => (
              <li key={f.featureId} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <Link
                  to={`/p/${pid}/features/${encodeURIComponent(f.featureId)}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {f.name}
                </Link>
                <span className="text-xs text-[var(--text-muted)]">
                  {t('impact.counts', { changed: f.changed, affected: f.affected })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.affected.routes.length > 0 && (
        <section aria-labelledby="affected-routes">
          <h2 id="affected-routes" className="text-lg font-semibold">
            {t('impact.routes')}
          </h2>
          <ul className="mt-2 space-y-1">
            {data.affected.routes.map((n) => (
              <li key={n.id}>
                <NodeLink node={n} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className="text-lg font-semibold">{t('impact.dependants')}</h2>
        {data.affected.nodes.length ? (
          <ul className="mt-2 space-y-1">
            {[...data.affected.nodes]
              .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
              .map((n) => (
                <li
                  key={n.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <NodeLink node={n} showPath />
                  <span className="text-[var(--text-muted)]">
                    {t('impact.hops', { n: n.distance })}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-muted)]">{t('impact.noAffected')}</p>
        )}
      </section>
      {data.flagsTouched.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">{t('impact.flags')}</h2>
          <ul className="mt-2 space-y-2">
            {data.flagsTouched.map((f) => (
              <li key={f.id}>
                <Link
                  to={`/p/${pid}/health?flag=${encodeURIComponent(f.id)}`}
                  className="text-sm hover:underline"
                >
                  <FlagBadge rule={f.rule} severity={f.severity} /> {f.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.narrative && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">{t('impact.tests')}</h2>
          <Markdown text={data.narrative} citations={Array.from(refs.values())} />
        </section>
      )}
    </div>
  );
}

export function Impact() {
  const { pid } = useParams();
  const [params, setParams] = useSearchParams();
  const base = params.get('base') || undefined;
  const project = useProject(pid).data;
  const response = useDiffImpact(project ? pid : undefined, {
    base,
    narrative: project?.aiStatus === 'done' || project?.aiStatus === 'partial',
    lang: project?.outputLanguage,
  });
  return (
    <article data-testid="page-impact" className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.impact')}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{t('impact.intro')}</p>
      </header>
      {!response.data?.unavailable && <BaseSelector
        key={base ?? ''}
        base={base}
        compare={(ref) => {
          const next = new URLSearchParams(params);
          if (ref) next.set('base', ref);
          else next.delete('base');
          setParams(next);
        }}
      />}
      {response.error ? (
        <ErrorCard error={response.error} onRetry={() => void response.refetch()} />
      ) : response.data && pid ? (
        <Comparison pid={pid} data={response.data} base={base} />
      ) : (
        <PageSkeleton />
      )}
    </article>
  );
}
