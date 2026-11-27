import {
  ids,
  type DiffImpactDTO,
  type GraphResponse,
  type TreeNodeDTO,
  type SettingsDTO,
  type SettingsUpdate,
} from '../src/api/contract';
import type { FixtureIndex } from './fixture-schema';

export function settingsAfter(current: SettingsDTO, update: SettingsUpdate): SettingsDTO {
  const { provider, models, ...options } = update;
  const next = { ...current, ...options, models: { ...current.models, ...models } };
  if (provider === undefined) return next;
  if (
    !provider ||
    ('apiKey' in provider && provider.apiKey === null && provider.type !== 'openai-compatible')
  ) {
    return { ...next, provider: null };
  }
  const saved = current.provider?.type === provider.type ? current.provider : null;
  const key = 'apiKey' in provider ? provider.apiKey : undefined;
  const mask =
    key === undefined
      ? saved?.apiKeyMasked
      : key
        ? '…' + (key.length > 4 ? key.slice(-4) : '')
        : null;
  return {
    ...next,
    provider: {
      type: provider.type,
      autoDetected: false,
      apiKeyMasked: mask ?? null,
      apiKeySource: mask ? 'config' : 'none',
      binary: 'binary' in provider ? (provider.binary ?? 'claude') : null,
      baseUrl: 'baseUrl' in provider ? (provider.baseUrl ?? saved?.baseUrl ?? null) : null,
    },
  };
}

export function treeAt(tree: TreeNodeDTO, path: string, depth: number): TreeNodeDTO | undefined {
  if (tree.path !== path) {
    for (const child of tree.children ?? []) {
      const found = treeAt(child, path, depth);
      if (found) return found;
    }
    return undefined;
  }
  function limit(node: TreeNodeDTO, remaining: number): TreeNodeDTO {
    const { children, ...fields } = node;
    return children && remaining > 0
      ? { ...fields, children: children.map((c) => limit(c, remaining - 1)) }
      : fields;
  }
  return limit(tree, depth);
}

export function graphAt(base: GraphResponse, params: URLSearchParams): GraphResponse {
  const csv = (name: string) => params.get(name)?.split(',').filter(Boolean);
  const kinds = csv('nodeKinds'),
    edgeKinds = csv('edgeKinds'),
    sources = csv('provenance');
  const feature = params.get('feature'),
    focus = params.get('focus');
  let nodes = base.nodes.filter(
    (n) =>
      (!feature || n.featureId === feature || n.id === feature) &&
      (!kinds || kinds.includes(n.kind)),
  );
  let edges = base.edges.filter(
    (e) =>
      (!edgeKinds || edgeKinds.includes(e.kind)) && (!sources || sources.includes(e.provenance)),
  );
  if (focus) {
    const selected = new Set([focus]);
    for (let i = 0; i < Number(params.get('depth') ?? 2); i++) {
      const previous = new Set(selected);
      for (const e of edges) {
        if (previous.has(e.source)) selected.add(e.target);
        if (previous.has(e.target)) selected.add(e.source);
      }
      if (selected.size === previous.size) break;
    }
    nodes = nodes.filter((n) => selected.has(n.id));
  }
  const totalNodes = nodes.length;
  nodes = nodes.slice(0, Number(params.get('limit') ?? 400));
  const visible = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => visible.has(e.source) && visible.has(e.target));
  return {
    ...base,
    nodes,
    edges,
    totalNodes,
    truncated: base.truncated || nodes.length < totalNodes,
  };
}

export function demoDiff(f: FixtureIndex, base = 'HEAD'): DiffImpactDTO {
  const root = ids.file('lib/session.ts');
  const impact = f.impact[root]!;
  const changed = f.nodes[root]!.node;
  return {
    base,
    head: 'working tree',
    changedFiles: [{ path: 'lib/session.ts', status: 'modified' }],
    changedNodes: [changed],
    affected: {
      nodes: impact.nodes.filter((n) => n.direction === 'up'),
      features: impact.byFeature.map((g) => ({
        featureId: g.featureId,
        name: f.features.find((it) => it.id === g.featureId)?.name ?? g.featureId,
        changed: 0,
        affected: g.count,
      })),
      routes: impact.nodes.filter((n) => n.kind === 'route' && n.direction === 'up'),
    },
    flagsTouched: f.health.flags.filter((flag) => flag.node.id === root),
    narrative: null,
  };
}
