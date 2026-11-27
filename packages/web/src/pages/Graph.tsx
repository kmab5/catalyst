import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Network, Search, X } from 'lucide-react';
import { ids, type GraphQuery, type GraphResponse } from '@/api/contract';
import {
  useDiffImpact,
  useFeatures,
  useFind,
  useHealth,
  useImpact,
  useNode,
  useProject,
} from '@/api/hooks/queries';
import { ErrorCard } from '@/components/ErrorCard';
import { FeatureDot } from '@/components/FeatureDot';
import { PageSkeleton } from '@/components/Skeleton';
import { t } from '@/i18n/t';
import { toElements } from './graph/elements';
import { GraphFilters, readFilters } from './graph/GraphFilters';
import type { HoverNode } from './graph/GraphCanvas';
import { useFilteredGraph } from './graph/useFilteredGraph';
import './graph/graph.css';

const GraphCanvas = lazy(() => import('./graph/GraphCanvas').then((m) => ({ default: m.GraphCanvas })));

function GraphSearch({ pid, onFocus }: { pid?: string; onFocus: (id: string, kind: string) => void }) {
  const [search, setSearch] = useState('');
  const found = useFind(pid, search, { limit: 7 });
  return (
    <div className="graph-search">
      <label>
        <Search size={14} />
        <input
          type="search"
          aria-label={t('graph.find')}
          placeholder={t('graph.find')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearch('');
          }}
        />
      </label>
      {search.trim() && (
        <div className="graph-results">
          {found.error ? (
            <ErrorCard error={found.error} onRetry={() => void found.refetch()} />
          ) : !found.data ? (
            <span>{t('common.loading')}</span>
          ) : !found.data.length ? (
            <span>{t('graph.noMatches')}</span>
          ) : (
            found.data.map(({ node }) => (
              <button
                type="button"
                key={node.id}
                onClick={() => {
                  onFocus(node.id, node.kind);
                  setSearch('');
                }}
              >
                <strong>{node.name}</strong>
                <small>{node.filePath ?? node.kind}</small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function GraphNodeCard({
  pid,
  selected,
  focus,
  onFocus,
  onDismiss,
}: {
  pid: string;
  selected: string;
  focus?: string;
  onFocus: () => void;
  onDismiss: () => void;
}) {
  const xray = useNode(pid, selected);
  const node = xray.data?.node;
  return (
    <aside className="graph-card">
      <header>
        <h2>{node?.name ?? selected}</h2>
        <button aria-label={t('graph.dismiss')} type="button" onClick={onDismiss}>
          <X size={15} />
        </button>
      </header>
      {xray.error ? (
        <ErrorCard error={xray.error} onRetry={() => void xray.refetch()} />
      ) : xray.data ? (
        <>
          <code>{node?.filePath || node?.kind}</code>
          {(xray.data.symbolPurpose ?? xray.data.summary?.purpose) && (
            <p>{xray.data.symbolPurpose ?? xray.data.summary?.purpose}</p>
          )}
          <span>
            {t('graph.nodeStats', { up: xray.data.upstream.length, down: xray.data.downstream.length })}
          </span>
        </>
      ) : (
        <span>{t('common.loading')}</span>
      )}
      <div>
        <Link to={`/p/${pid}/explorer?node=${encodeURIComponent(selected)}`}>
          {t('common.openInExplorer')}
        </Link>
        {focus !== selected && (
          <button type="button" onClick={onFocus}>
            {t('graph.focus')}
          </button>
        )}
      </div>
    </aside>
  );
}

function GraphTooltip({ pid, hover }: { pid?: string; hover: HoverNode }) {
  const xray = useNode(pid, hover.id);
  return (
    <div
      role="tooltip"
      className="graph-tooltip"
      style={{
        left: `clamp(0px, ${hover.x + 8}px, max(0px, 100% - 220px))`,
        top: `clamp(0px, ${hover.y + 12}px, max(0px, 100% - 150px))`,
      }}
    >
      <strong>{hover.label}</strong>
      {xray.data && (
        <>
          <p>{xray.data.symbolPurpose ?? xray.data.summary?.purpose}</p>
          <small>
            {t('graph.nodeStats', { up: xray.data.upstream.length, down: xray.data.downstream.length })}
          </small>
        </>
      )}
    </div>
  );
}
function GraphLegend({ diff }: { diff: boolean }) {
  return (
    <details className="graph-legend" open>
      <summary>{t('graph.legend')}</summary>
      <ul>
        {(
          [
            { key: 'graph.usedBy', mark: 'up' },
            { key: 'graph.uses', mark: 'down' },
            { key: 'graph.high', mark: 'high' },
            { key: 'graph.solid', mark: 'solid' },
            { key: 'graph.dashed', mark: 'dashed' },
            { key: 'graph.dotted', mark: 'dotted' },
            ...(diff
              ? ([
                  { key: 'graph.changed', mark: 'changed' },
                  { key: 'graph.affected', mark: 'up' },
                ] as const)
              : []),
          ] as const
        ).map((item) => (
          <li key={item.key}>
            <i className={'legend-' + item.mark} />
            {t(item.key)}
          </li>
        ))}
      </ul>
    </details>
  );
}
function defaultLevel(focus: string | undefined, done: boolean): GraphResponse['level'] {
  if (focus) {
    try {
      const kind = ids.kindOf(focus);
      if (kind === 'feature') return 'feature';
      if (kind === 'directory') return 'module';
      if (kind !== 'file') return 'symbol';
    } catch {
      /* The server reports invalid focus IDs. */
    }
    return 'file';
  }
  return done ? 'feature' : 'file';
}
export function Graph() {
  const { pid } = useParams<{ pid: string }>();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const project = useProject(pid),
    features = useFeatures(pid);
  const high = useHealth(pid, { severity: 'high' });
  const focus = params.get('focus') || undefined;
  const rawLevel = params.get('level');
  const level =
    rawLevel === 'feature' ||
    rawLevel === 'module' ||
    rawLevel === 'file' ||
    (rawLevel === 'symbol' && focus)
      ? rawLevel
      : defaultLevel(focus, project.data?.aiStatus === 'done');
  const group = params.get('group') === 'folder' ? 'folder' : 'feature';
  const depth = Math.min(4, Math.max(1, Number.parseInt(params.get('depth') ?? '3', 10) || 3));
  const filters = useMemo(() => readFilters(params, level), [params, level]);
  const query = useMemo(
    (): GraphQuery => ({
      level,
      focus,
      depth,
      edgeKinds: filters.edgeKinds,
      nodeKinds: filters.nodeKinds,
      provenance: filters.provenance,
      limit: 400,
    }),
    [level, focus, depth, filters],
  );
  const graph = useFilteredGraph(pid, query, filters.featureIds);
  const [clicked, setClicked] = useState<{ key: string; id?: string }>();
  const selected = clicked?.key === location.key ? clicked.id : focus;
  const impact = useImpact(pid, selected, 'both', depth);
  const [hover, setHover] = useState<HoverNode>();
  const diffMode = params.get('diff') === '1';
  const passed = location.state as { changedIds?: string[]; affectedIds?: string[] } | null;
  const diff = useDiffImpact(diffMode && !passed?.changedIds ? pid : undefined, {
    base: params.get('base') || undefined,
    narrative: false,
  });
  const elements = useMemo(() => {
    if (!graph.data || graph.data.truncated) return [];
    const colors = Object.fromEntries((features.data ?? []).map((f) => [f.id, f.colorIndex % 8]));
    const highIds = new Set(
      (high.data?.flags ?? []).flatMap((f) => [
        f.node.id,
        ...(f.node.filePath ? [ids.file(f.node.filePath)] : []),
      ]),
    );
    const memberCounts = Object.fromEntries((features.data ?? []).map((f) => [f.id, f.memberCount]));
    const result = toElements(graph.data, colors, group, highIds, memberCounts);
    if (diffMode) {
      const changed = new Set(
        passed?.changedIds ??
          diff.data?.changedNodes.flatMap((n) => [n.id, ...(n.filePath ? [ids.file(n.filePath)] : [])]),
      );
      const affected = new Set(
        passed?.affectedIds ??
          diff.data?.affected.nodes.flatMap((n) => [
            n.id,
            ...(n.filePath ? [ids.file(n.filePath)] : []),
          ]),
      );
      for (const e of result)
        if (e.data.id) {
          if (changed.has(e.data.id)) e.classes += ' changed';
          else if (affected.has(e.data.id)) e.classes += ' affected';
        }
    }
    return result;
  }, [graph.data, features.data, high.data, group, diffMode, passed, diff.data]);
  function change(updates: Record<string, string | null>) {
    setHover(undefined);
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates))
      if (value === null) next.delete(key);
      else next.set(key, value);
    setParams(next);
  }
  function focusNode(id: string, kind: string) {
    change({
      focus: id,
      level:
        kind === 'feature'
          ? 'feature'
          : kind === 'directory'
            ? 'module'
            : kind === 'file'
              ? 'file'
              : 'symbol',
      feature: null,
      edgeKinds: null,
      nodeKinds: null,
    });
  }
  return (
    <section className="graph-page" data-testid="page-graph">
      <header className="graph-heading">
        <Network size={18} />
        <h1>{t('nav.graph')}</h1>
        {graph.data && (
          <span>
            {t('graph.counts', { nodes: graph.data.totalNodes, edges: graph.data.edges.length })}
          </span>
        )}
      </header>
      <GraphFilters
        level={level}
        focus={focus}
        depth={depth}
        group={group}
        filters={filters}
        features={features.data ?? []}
        change={change}
      />
      <div className="graph-stage">
        <div className="graph-tools">
          <GraphSearch pid={pid} onFocus={focusNode} />
          {focus && (
            <button
              className="graph-unfocus"
              onClick={() => change({ focus: null, level: level === 'symbol' ? 'file' : level })}
            >
              {t('graph.unfocus')} <X size={13} />
            </button>
          )}
        </div>
        {graph.error ? (
          <ErrorCard error={graph.error} onRetry={graph.refetch} />
        ) : !graph.data ? (
          <PageSkeleton />
        ) : graph.data.truncated ? (
          <div className="graph-cap">
            <h2>{t('graph.capTitle')}</h2>
            <p>{t('graph.tooManyNodes', { total: graph.data.totalNodes.toLocaleString() })}</p>
            <div>
              {features.data?.map((f) => (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => change({ level: 'file', feature: f.id, focus: null })}
                >
                  <FeatureDot colorIndex={f.colorIndex} />
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        ) : !graph.data.nodes.length ? (
          <p className="graph-status">{t('graph.empty')}</p>
        ) : (
          <Suspense fallback={<PageSkeleton />}>
            <GraphCanvas
              elements={elements}
              selected={selected}
              impact={impact.data}
              onSelect={(id) => setClicked({ key: location.key, id })}
              onOpen={(id) => navigate(`/p/${pid}/explorer?node=${encodeURIComponent(id)}`)}
              onHover={setHover}
            />
          </Suspense>
        )}
        {selected && pid && !graph.data?.truncated && (
          <GraphNodeCard
            pid={pid}
            selected={selected}
            focus={focus}
            onFocus={() => change({ focus: selected, depth: String(depth) })}
            onDismiss={() => setClicked({ key: location.key })}
          />
        )}
        {hover && <GraphTooltip hover={hover} pid={pid} />}
        {impact.error && (
          <div className="graph-error">
            <ErrorCard error={impact.error} onRetry={() => void impact.refetch()} />
          </div>
        )}
        {diffMode && diff.error && (
          <div className="graph-error">
            <ErrorCard error={diff.error} onRetry={() => void diff.refetch()} />
          </div>
        )}
        {graph.data && !graph.data.truncated && <GraphLegend diff={diffMode} />}
      </div>
    </section>
  );
}
