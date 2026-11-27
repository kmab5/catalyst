import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import type { FlagDTO } from '@/api/contract';
import { FlagBadge } from '@/components/FlagBadge';
import { NodeLink } from '@/components/NodeLink';
import { NodeIdLink } from '@/components/NodeIdLink';
import { t } from '@/i18n/t';
import type { I18nKey } from '@/i18n/en';

const rules = [
  'cycle',
  'hub',
  'god-file',
  'god-function',
  'unused-export',
  'deep-relative-import',
  'pass-through-wrapper',
  'single-impl-interface',
  'missing-auth-on-mutating-route',
  'cross-feature-coupling',
] as const;
const severityOrder = { high: 0, warn: 1, info: 2 };

function FlagRow({ flag, selected }: { flag: FlagDTO; selected: boolean }) {
  const { pid } = useParams();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'center' });
  }, [selected]);
  const evidence = flag.evidence.nodeIds ?? [];
  const metrics = Object.entries(flag.evidence.metrics ?? {});
  return (
    <details
      ref={ref}
      open={selected || undefined}
      className={`rounded-md border px-3 py-2 ${selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`}
    >
      <summary className="cursor-pointer text-sm">
        <FlagBadge severity={flag.severity} rule={t(`health.${flag.severity}`)} />{' '}
        <span className="ml-1 font-medium">{flag.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <NodeLink node={flag.node} showPath />
          {metrics.slice(0, 2).map(([name, value]) => (
            <span key={name} className="text-xs text-[var(--text-muted)]">
              {name} · {value}
            </span>
          ))}
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {flag.explanation && <p className="max-w-prose leading-relaxed">{flag.explanation}</p>}
        {metrics.length > 0 && (
          <dl className="flex flex-wrap gap-3">
            {metrics.map(([name, value]) => (
              <div key={name} className="flex gap-1 text-xs">
                <dt className="text-[var(--text-muted)]">{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {evidence.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-medium">{t('health.evidence')}</h4>
            <div className="flex flex-wrap gap-3">
              {evidence.map((id) => (
                <NodeIdLink key={id} id={id} node={id === flag.node.id ? flag.node : undefined} />
              ))}
            </div>
          </div>
        )}
        <Link
          to={`/p/${pid}/graph?level=file&focus=${encodeURIComponent(flag.node.id)}`}
          className="inline-block text-xs text-[var(--accent)] hover:underline"
        >
          {t('common.showInGraph')}
        </Link>
      </div>
    </details>
  );
}

export function FlagList({ flags, selected }: { flags: FlagDTO[]; selected: string | null }) {
  const groups = new Map<string, FlagDTO[]>();
  for (const flag of [...flags].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.rule.localeCompare(b.rule),
  )) {
    const group = groups.get(flag.rule) ?? [];
    group.push(flag);
    groups.set(flag.rule, group);
  }
  return (
    <div className="space-y-6">
      {Array.from(groups, ([rule, rows]) => {
        const known = rules.find((r) => r === rule);
        const reason: I18nKey = known ? `health.why.${known}` : 'health.why.other';
        return (
          <details open key={rule} className="border-t border-[var(--border)] pt-4">
            <summary className="cursor-pointer">
              <h2 className="inline text-base font-semibold">
                {known ? t(`health.rule.${known}`) : rule}
              </h2>{' '}
              <span className="text-xs text-[var(--text-muted)]">({rows.length})</span>
            </summary>
            <p className="my-3 max-w-prose text-sm text-[var(--text-muted)]">
              <strong>{t('health.whyMatters')}.</strong> {t(reason)}
            </p>
            <ul className="space-y-2">
              {rows.map((flag) => (
                <li key={flag.id}>
                  <FlagRow flag={flag} selected={flag.id === selected} />
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
