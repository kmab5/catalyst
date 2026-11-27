import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/api/client';
import type { GraphQuery, GraphResponse } from '@/api/contract';
import { useGraph } from '@/api/hooks/queries';

type Edge = GraphResponse['edges'][number];
const edgeKey = (e: Edge) => JSON.stringify([e.source, e.target, e.kind, e.provenance]);

function mergeFeatures(base: GraphResponse, parts: GraphResponse[]): GraphResponse {
  const members = new Map<string, GraphResponse['nodes'][number]>();
  const edges = new Map<string, Edge>();
  let capped = false;
  let total = 0;
  for (const part of parts) {
    for (const n of part.nodes) members.set(n.id, n);
    for (const e of part.edges) edges.set(edgeKey(e), e);
    capped ||= part.truncated;
    total += part.totalNodes;
  }
  for (const e of base.edges) {
    if (members.has(e.source) && members.has(e.target)) edges.set(edgeKey(e), e);
  }
  return {
    ...base,
    nodes: [...members.values()],
    edges: [...edges.values()],
    totalNodes: capped ? total : members.size,
    truncated: capped || members.size > 400,
  };
}

function collectResponses(results: UseQueryResult<GraphResponse>[]) {
  return {
    responses: results.flatMap((result) => (result.data ? [result.data] : [])),
    error: results.find((result) => result.error)?.error,
  };
}

// The API accepts one feature per request. Filtering a complete graph preserves
// cross-feature edges. If it was capped, request each selected feature instead.
export function useFilteredGraph(pid: string | undefined, query: GraphQuery, features: string[]) {
  const client = useQueryClient();
  const combined = useGraph(pid, {
    ...query,
    feature: features.length === 1 && query.level !== 'feature' ? features[0] : undefined,
  });
  const split = Boolean(
    pid && query.level !== 'feature' && features.length > 1 && combined.data?.truncated,
  );
  const parts = useQueries({
    queries: (split ? features : []).map((feature) => ({
      queryKey: ['graph', pid, JSON.stringify({ ...query, feature })],
      queryFn: () => api.graph(pid!, { ...query, feature }),
    })),
    combine: collectResponses,
  });
  const data = useMemo((): GraphResponse | undefined => {
    const base = combined.data;
    if (!base) return;
    let result = base;
    if (split) {
      if (parts.responses.length !== features.length) return;
      result = mergeFeatures(base, parts.responses);
    } else if (features.length && (features.length > 1 || query.level === 'feature')) {
      const nodes = base.nodes.filter(
        (n) => features.includes(n.id) || (n.featureId && features.includes(n.featureId)),
      );
      const ids = new Set(nodes.map((n) => n.id));
      result = {
        ...base,
        nodes,
        edges: base.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
        totalNodes: nodes.length,
      };
    }
    if (!query.nodeKinds?.length)
      return { ...result, nodes: [], edges: [], totalNodes: 0, truncated: false };
    if (!query.edgeKinds?.length || !query.provenance?.length) return { ...result, edges: [] };
    return result;
  }, [combined.data, split, parts.responses, features, query]);
  return {
    data,
    error: combined.error ?? parts.error,
    refetch: () => void client.refetchQueries({ queryKey: ['graph', pid], type: 'active' }),
  };
}
