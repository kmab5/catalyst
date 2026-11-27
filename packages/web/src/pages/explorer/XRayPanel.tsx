import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  Database,
  FileCode2,
  Folder,
  Globe,
  KeyRound,
  Mail,
  Network,
  ScanLine,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { EdgeRefDTO, SideEffect, XRayDTO } from '@/api/contract';
import { useFeatures, useImpact, useNode } from '@/api/hooks/queries';
import { ErrorCard } from '@/components/ErrorCard';
import { FeatureChip } from '@/components/FeatureChip';
import { FlagBadge } from '@/components/FlagBadge';
import { Markdown } from '@/components/Markdown';
import { NodeLink } from '@/components/NodeLink';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { PageSkeleton } from '@/components/Skeleton';
import { t } from '@/i18n/t';
import { copyForAi } from './copyForAi';
import './explorer.css';

const effectIcons = {
  db_read: Database,
  db_write: Database,
  network: Globe,
  filesystem: Folder,
  env: KeyRound,
  state: Settings2,
  auth: ShieldCheck,
  email: Mail,
  payment: CreditCard,
  log: FileCode2,
  other: Network,
} satisfies Record<SideEffect['kind'], typeof Network>;

function Section({
  title,
  children,
  collapsed = false,
}: {
  title: string;
  children: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <details className="xray-section" open={!collapsed}>
      <summary>
        <h3>{title}</h3>
        <ChevronRight size={13} />
      </summary>
      <div>{children}</div>
    </details>
  );
}

function Connections({ up, down }: { up: EdgeRefDTO[]; down: EdgeRefDTO[] }) {
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [showAll, setShowAll] = useState(false);
  const edges = direction === 'up' ? up : down;
  const groups = new Map<string, EdgeRefDTO[]>();
  for (const edge of showAll ? edges : edges.slice(0, 20)) {
    const group = groups.get(edge.kind) ?? [];
    group.push(edge);
    groups.set(edge.kind, group);
  }
  return (
    <>
      <div className="xray-tabs">
        {(['up', 'down'] as const).map((key) => (
          <button
            type="button"
            key={key}
            aria-pressed={direction === key}
            onClick={() => {
              setDirection(key);
              setShowAll(false);
            }}
          >
            {key === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
            {t(key === 'up' ? 'explorer.up' : 'explorer.down', {
              n: key === 'up' ? up.length : down.length,
            })}
          </button>
        ))}
      </div>
      {!edges.length && <p>{t('explorer.none')}</p>}
      {Array.from(groups, ([kind, group]) => (
        <div key={kind} className="edge-group">
          <h4>{kind}</h4>
          <ul>
            {group.map((e, i) => (
              <li key={e.node.id + '-' + i}>
                <NodeLink node={e.node} />
                <ProvenanceBadge provenance={e.provenance} confidence={e.confidence} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {edges.length > 20 && (
        <button className="panel-action" type="button" onClick={() => setShowAll(!showAll)}>
          {showAll ? t('explorer.less') : t('explorer.all', { n: edges.length })}
        </button>
      )}
    </>
  );
}

function ImpactPreview({ data, pid }: { data: XRayDTO; pid: string }) {
  const [expanded, setExpanded] = useState(false);
  const impact = useImpact(expanded ? pid : undefined, data.node.id, 'up', 3);
  const preview = data.impactPreview;
  return (
    <>
      <p>
        {t(preview.dependants === 1 ? 'explorer.oneDependant' : 'explorer.dependants', {
          places: preview.dependants,
          features: t(preview.features.length === 1 ? 'explorer.oneFeature' : 'explorer.features', {
            n: preview.features.length,
          }),
          routes: t(preview.routes.length === 1 ? 'explorer.oneRoute' : 'explorer.routes', {
            n: preview.routes.length,
          }),
        })}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          className="panel-action"
          to={`/p/${pid}/graph?focus=${encodeURIComponent(data.node.id)}&depth=3`}
        >
          {t('common.showInGraph')}
        </Link>
        <button
          className="panel-action"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? 'explorer.hide' : 'explorer.full')}
        </button>
      </div>
      {expanded &&
        (impact.error ? (
          <ErrorCard error={impact.error} onRetry={() => void impact.refetch()} />
        ) : impact.data ? (
          <div data-testid="impact-list">
            {!impact.data.nodes.length && <p>{t('explorer.none')}</p>}
            <ul>
              {impact.data.nodes.map((n) => (
                <li key={n.id}>
                  <NodeLink node={n} showPath />
                </li>
              ))}
            </ul>
            {impact.data.truncated && <p>{t('explorer.limitedImpact')}</p>}
          </div>
        ) : (
          <span>{t('common.loading')}</span>
        ))}
    </>
  );
}

export function XRayPanel({ nodeId, onClose }: { nodeId: string; onClose?: () => void }) {
  const { pid } = useParams<{ pid: string }>();
  const { data, error, refetch } = useNode(pid, nodeId);
  const features = useFeatures(pid);
  const [clipboard, setClipboard] = useState<'copied' | 'failed'>();
  if (error) return <ErrorCard error={error} onRetry={() => void refetch()} />;
  if (!data || !pid) return <PageSkeleton />;
  const { node, summary } = data;
  const purpose = data.symbolPurpose ?? summary?.purpose;
  const position = summary && 'positionInApp' in summary && summary.positionInApp;
  const citations = [node, ...data.upstream.map((e) => e.node), ...data.downstream.map((e) => e.node)];
  const connect = (
    <Link className="panel-action" to="/settings">
      {t('explorer.noAi')}
    </Link>
  );
  return (
    <aside
      className="xray-panel"
      aria-label={t('explorer.panel')}
      data-testid="xray-panel"
      data-node={node.id}
    >
      <header className="explorer-bar">
        <ScanLine size={15} />
        {t('explorer.panel')}
        {onClose && (
          <button type="button" className="ml-auto" aria-label={t('explorer.close')} onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </header>
      <div className="xray-identity">
        <h2>{node.name}</h2>
        <span>{node.symbolKind ?? node.kind}</span>
      </div>
      <Section title={t('explorer.purpose')}>
        {purpose ? <Markdown text={purpose} citations={citations} /> : connect}
        {summary?.details && (
          <details>
            <summary className="panel-action">{t('explorer.more')}</summary>
            <Markdown text={summary.details} citations={citations} />
          </details>
        )}
      </Section>
      <Section title={t('explorer.position')}>
        {position ? <Markdown text={position} citations={citations} /> : !summary ? connect : null}
        {data.features.length ? (
          <div className="flex flex-wrap gap-1">
            {data.features.map((f) => (
              <FeatureChip
                key={f.id}
                featureId={f.id}
                name={f.name}
                role={f.role}
                colorIndex={features.data?.find((item) => item.id === f.id)?.colorIndex ?? 0}
              />
            ))}
          </div>
        ) : (
          <p>{t('explorer.noMembers')}</p>
        )}
      </Section>
      <Section title={t('explorer.connections')}>
        <Connections key={node.id} up={data.upstream} down={data.downstream} />
      </Section>
      <Section title={t('explorer.effects')}>
        {data.sideEffects.length ? (
          <ul className="effect-list">
            {data.sideEffects.map((e, i) => {
              const Icon = effectIcons[e.kind];
              return (
                <li key={i}>
                  <Icon size={14} />
                  {e.target ? (
                    <Link to={`/p/${pid}/explorer?node=${encodeURIComponent(e.target)}`}>
                      {e.description}
                    </Link>
                  ) : (
                    <span>{e.description}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{t('explorer.noEffects')}</p>
        )}
      </Section>
      <Section title={t('explorer.change')}>
        <ImpactPreview key={node.id} data={data} pid={pid} />
      </Section>
      <Section title={t('nav.health')}>
        {data.flags.length ? (
          <ul className="space-y-2">
            {data.flags.map((f) => (
              <li key={f.id}>
                <Link to={`/p/${pid}/health?flag=${encodeURIComponent(f.id)}`}>
                  <FlagBadge severity={f.severity} rule={f.rule} /> <span>{f.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('explorer.noFlags')}</p>
        )}
      </Section>
      <Section title={t('explorer.provenance')} collapsed>
        <ProvenanceBadge provenance={node.provenance} confidence={node.confidence} />
        {node.provenance !== 'inferred' && (
          <span className="ml-2">{Math.round(node.confidence * 100)}%</span>
        )}
        {node.signature && <code className="block break-all">{node.signature}</code>}
        <dl className="xray-metrics">
          {Object.entries(node.metrics).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <div className="p-4">
        <button
          className="panel-action inline-flex items-center gap-2"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(copyForAi(data));
              setClipboard('copied');
            } catch {
              setClipboard('failed');
            }
          }}
        >
          {clipboard === 'copied' ? <Check size={14} /> : <Copy size={14} />}
          {t(clipboard === 'copied' ? 'explorer.copied' : 'explorer.copy')}
        </button>
        {clipboard === 'failed' && <p role="alert">{t('explorer.copyFailed')}</p>}
      </div>
    </aside>
  );
}
