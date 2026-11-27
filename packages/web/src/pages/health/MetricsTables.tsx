import { useState } from 'react';
import type { HealthDTO } from '@/api/contract';
import { NodeLink } from '@/components/NodeLink';
import { t } from '@/i18n/t';

function MetricsTable({
  title,
  valueLabel,
  rows,
}: {
  title: string;
  valueLabel: string;
  rows: HealthDTO['metrics']['topFanIn'];
}) {
  const [sort, setSort] = useState<{ key: 'value' | 'name'; ascending: boolean }>({
    key: 'value',
    ascending: false,
  });
  const sorted = [...rows].sort(
    (a, b) =>
      (sort.key === 'name' ? a.node.name.localeCompare(b.node.name) : a.value - b.value) *
      (sort.ascending ? 1 : -1),
  );
  return (
    <table className="w-full text-left text-sm">
      <caption className="mb-2 text-left text-base font-semibold">{title}</caption>
      <thead className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
        <tr>
          {(['name', 'value'] as const).map((key) => (
            <th
              scope="col"
              key={key}
              aria-sort={sort.key === key ? (sort.ascending ? 'ascending' : 'descending') : 'none'}
              className="p-2"
            >
              <button
                type="button"
                onClick={() =>
                  setSort({ key, ascending: key === sort.key ? !sort.ascending : key === 'name' })
                }
              >
                {key === 'name' ? t('health.node') : valueLabel}{' '}
                {sort.key === key && (sort.ascending ? '↑' : '↓')}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">
        {sorted.map((row) => (
          <tr key={row.node.id}>
            <td className="p-2">
              <NodeLink node={row.node} showPath />
            </td>
            <td className="p-2 tabular-nums">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MetricsTables({ metrics }: Pick<HealthDTO, 'metrics'>) {
  return (
    <section className="space-y-8">
      <MetricsTable
        title={t('health.fanIn')}
        valueLabel={t('health.dependants')}
        rows={metrics.topFanIn}
      />
      <MetricsTable
        title={t('health.complexity')}
        valueLabel={t('health.branches')}
        rows={metrics.topComplexity}
      />
      <MetricsTable
        title={t('health.size')}
        valueLabel={t('health.lines')}
        rows={metrics.largestFiles}
      />
    </section>
  );
}
