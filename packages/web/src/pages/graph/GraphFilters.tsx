import { SlidersHorizontal } from 'lucide-react';
import {
  EdgeKind,
  NodeKind,
  Provenance,
  type FeatureListItemDTO,
  type GraphResponse,
} from '@/api/contract';
import { t } from '@/i18n/t';
import type { I18nKey } from '@/i18n/en';
import type { GroupMode } from './elements';

const fileEdges: EdgeKind[] = [
  'imports',
  'calls',
  'renders',
  'handles',
  'reads',
  'writes',
  'calls_service',
];

function fromQuery<T extends string>(
  value: string | null,
  options: readonly T[],
  defaults: readonly T[],
): T[] {
  if (value === null) return [...defaults];
  return [...new Set(value.split(',').filter((s): s is T => options.includes(s as T)))];
}

export function readFilters(params: URLSearchParams, level: GraphResponse['level']) {
  return {
    edgeKinds: fromQuery(
      params.get('edgeKinds'),
      EdgeKind.options,
      level === 'feature' ? ['feature_depends'] : fileEdges,
    ),
    nodeKinds: fromQuery(params.get('nodeKinds'), NodeKind.options, NodeKind.options),
    provenance: fromQuery(params.get('provenance'), Provenance.options, Provenance.options),
    featureIds: [...new Set((params.get('feature') ?? '').split(',').filter(Boolean))],
  };
}

interface Props {
  level: GraphResponse['level'];
  focus?: string;
  depth: number;
  group: GroupMode;
  filters: ReturnType<typeof readFilters>;
  features: FeatureListItemDTO[];
  change: (updates: Record<string, string | null>) => void;
}
function toggled(values: string[], value: string) {
  return (values.includes(value) ? values.filter((x) => x !== value) : [...values, value]).join(',');
}
export function GraphFilters({ level, focus, depth, group, filters, features, change }: Props) {
  const groups: {
    key: 'edgeKinds' | 'nodeKinds' | 'provenance';
    label: I18nKey;
    options: readonly string[];
  }[] = [
    { key: 'edgeKinds', label: 'graph.edgeKinds', options: EdgeKind.options },
    { key: 'nodeKinds', label: 'graph.nodeKinds', options: NodeKind.options },
    { key: 'provenance', label: 'graph.provenance', options: Provenance.options },
  ];
  return (
    <div className="graph-controls">
      <div className="graph-levels" aria-label={t('nav.graph')}>
        {(
          [
            { id: 'feature', label: 'graph.features' },
            { id: 'file', label: 'graph.files' },
            { id: 'module', label: 'graph.modules' },
            ...(focus ? [{ id: 'symbol', label: 'graph.symbols' } as const] : []),
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={level === item.id}
            onClick={() => change({ level: item.id, edgeKinds: null })}
          >
            {t(item.label)}
          </button>
        ))}
      </div>
      {level === 'file' && (
        <label className="graph-group">
          {t('graph.group')}{' '}
          <select value={group} onChange={(e) => change({ group: e.target.value })}>
            <option value="feature">{t('graph.byFeature')}</option>
            <option value="folder">{t('graph.byFolder')}</option>
          </select>
        </label>
      )}
      <label className="graph-depth">
        {t('graph.depth')}{' '}
        <input
          type="range"
          min="1"
          max="4"
          value={depth}
          onChange={(e) => change({ depth: e.target.value })}
        />
        <output>{depth}</output>
      </label>
      <details className="graph-filter-panel">
        <summary>
          <SlidersHorizontal size={14} />
          {t('graph.filters')}
        </summary>
        <div className="graph-filter-body">
          {groups.map(({ key, label, options }) => (
            <fieldset key={key}>
              <legend>{t(label)}</legend>
              {options.map((value) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={(filters[key] as string[]).includes(value)}
                    onChange={() => change({ [key]: toggled(filters[key], value) })}
                  />
                  {value}
                </label>
              ))}
            </fieldset>
          ))}
          {features.length > 0 && (
            <fieldset>
              <legend>{t('nav.features')}</legend>
              {features.map((f) => (
                <label key={f.id}>
                  <input
                    type="checkbox"
                    checked={filters.featureIds.includes(f.id)}
                    onChange={() => change({ feature: toggled(filters.featureIds, f.id) || null })}
                  />
                  {f.name}
                </label>
              ))}
            </fieldset>
          )}
          <button
            type="button"
            className="panel-action"
            onClick={() => change({ edgeKinds: null, nodeKinds: null, provenance: null, feature: null })}
          >
            {t('graph.clear')}
          </button>
        </div>
      </details>
    </div>
  );
}
