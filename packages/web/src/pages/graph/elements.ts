import type { ElementDefinition } from 'cytoscape';
import { ids, type GraphResponse } from '@/api/contract';
import { featureColor } from '@/components/FeatureDot';
import { t } from '@/i18n/t';

export type GroupMode = 'feature' | 'folder';
export function toElements(
  graph: GraphResponse,
  colors: Record<string, number>,
  group: GroupMode = 'feature',
  high: ReadonlySet<string> = new Set(),
  memberCounts: Record<string, number> = {},
): ElementDefinition[] {
  const nodes = new Map<string, ElementDefinition>();
  const supplied = new Map(graph.nodes.map((node) => [node.id, node]));
  const parentIds = new Set(graph.nodes.map((node) => node.parent));
  const groupedFiles = graph.level === 'file';
  for (const n of graph.nodes) {
    // A fixture can supply the compound itself. The engine can also return its ID only.
    if (groupedFiles && n.kind !== 'file' && parentIds.has(n.id)) continue;
    let parent: string | undefined;
    if (groupedFiles && n.kind === 'file') {
      const path = ids.parse(n.id).path ?? '';
      const slash = path.lastIndexOf('/');
      const directory = ids.dir(slash < 0 ? '' : path.slice(0, slash));
      parent = group === 'folder' ? directory : (n.featureId ?? n.parent ?? directory);
      if (!nodes.has(parent)) {
        const ref = supplied.get(parent);
        const parsed = ids.parse(parent);
        const label = ref?.label ?? (parsed.path || parsed.name || t('graph.rootFolder'));
        nodes.set(parent, {
          group: 'nodes',
          classes: 'group',
          data: { id: parent, label, kind: parsed.kind, colorIndex: colors[parent] ?? -1, size: 18 },
        });
      }
    }
    const index = colors[n.featureId ?? n.id] ?? -1;
    const magnitude = graph.level === 'feature' ? (memberCounts[n.id] ?? n.size) : n.size;
    nodes.set(n.id, {
      group: 'nodes',
      classes: high.has(n.id) ? 'high' : '',
      data: {
        id: n.id,
        label: n.label,
        kind: n.kind,
        parent,
        size: Math.min(60, 15 + 5 * Math.log2(1 + Math.max(0, magnitude))),
        colorIndex: index,
        color: index < 0 ? 'var(--text-muted)' : featureColor(index),
        flags: n.flags,
      },
    });
  }
  const edges = graph.edges
    .filter((e) => nodes.has(e.source) && nodes.has(e.target))
    .map((e) => ({
      group: 'edges' as const,
      classes: e.provenance,
      data: {
        source: e.source,
        target: e.target,
        kind: e.kind,
        weight: Math.min(6, 1 + Math.log2(Math.max(1, e.weight))),
      },
    }));
  return [...nodes.values(), ...edges];
}
