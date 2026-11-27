import { Fragment } from 'react';
import { Link, useParams } from 'react-router';
import type { HealthDTO } from '@/api/contract';
import { NodeLink } from '@/components/NodeLink';
import { t } from '@/i18n/t';

export function CycleList({ cycles }: Pick<HealthDTO, 'cycles'>) {
  const { pid } = useParams();
  if (!cycles.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t('health.cycles')}</h2>
      {cycles.map((cycle) => {
        const first = cycle.nodes[0];
        if (!first) return null;
        const path = cycle.nodes.at(-1)?.id === first.id ? cycle.nodes : [...cycle.nodes, first];
        return (
          <div
            key={cycle.id}
            className="flex flex-wrap items-center gap-1 rounded-md bg-[var(--surface-2)] p-3"
          >
            {path.map((n, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden="true">→</span>}
                <NodeLink node={n} />
              </Fragment>
            ))}
            <Link
              className="ml-auto text-xs text-[var(--accent)] hover:underline"
              to={`/p/${pid}/graph?level=file&focus=${encodeURIComponent(first.id)}`}
            >
              {t('common.showInGraph')}
            </Link>
          </div>
        );
      })}
    </section>
  );
}
