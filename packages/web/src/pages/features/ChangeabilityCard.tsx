import type { Changeability, NodeRef } from '@/api/contract';
import { Markdown } from '@/components/Markdown';
import { NodeIdLink } from '@/components/NodeIdLink';
import { t } from '@/i18n/t';

export function ChangeabilityCard({
  card,
  nodes,
}: {
  card: Changeability;
  nodes: Map<string, NodeRef>;
}) {
  const citations = Array.from(nodes.values());
  return (
    <section
      aria-labelledby="changeability-title"
      className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <h2 id="changeability-title" className="text-lg font-semibold">
        {t('features.change')}
      </h2>
      <Markdown text={card.summary} citations={citations} />
      <dl className="divide-y divide-[var(--border)]">
        {(
          [
            ['features.add', card.addEase],
            ['features.modify', card.changeEase],
            ['features.remove', card.removeEase],
          ] as const
        ).map(([label, ease]) => (
          <div key={label} className="grid gap-2 py-2.5 md:grid-cols-[9rem_1fr]">
            <dt className="flex items-baseline gap-2 text-sm font-medium">
              <span>{t(label)}</span>
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-normal">
                {t(`level.${ease.level}`)}
              </span>
            </dt>
            <dd>
              <Markdown text={ease.reason} citations={citations} />
            </dd>
          </div>
        ))}
      </dl>
      {card.risks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">{t('features.risks')}</h3>
          <ul className="mt-2 space-y-2">
            {card.risks.map((risk, i) => (
              <li key={i}>
                <Markdown text={risk.text} citations={citations} />
                <div className="flex flex-wrap gap-2">
                  {risk.nodeIds.map((id) => (
                    <NodeIdLink key={id} id={id} node={nodes.get(id)} showPath />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {card.touchpoints.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">{t('features.touch')}</h3>
          <div className="mt-2 flex flex-wrap gap-3">
            {card.touchpoints.map((id) => (
              <NodeIdLink key={id} id={id} node={nodes.get(id)} showPath />
            ))}
          </div>
        </div>
      )}
      {(card.citesMetrics.length > 0 || card.couplings.length > 0) && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{t('features.numbers')}</summary>
          <ul className="mt-2 space-y-1">
            {card.citesMetrics.map((m, i) => (
              <li key={i}>
                {m.name}: {m.value}{' '}
                {m.nodeId && <NodeIdLink id={m.nodeId} node={nodes.get(m.nodeId)} />}
              </li>
            ))}
            {card.couplings.map((c) => (
              <li key={c.featureId}>
                <NodeIdLink id={c.featureId} /> · {c.edgeCount} · {c.note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
