import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Lang } from '../contract';
import { api } from '../client';
import type {
  EdgeKind,
  GraphQuery,
  IndexRequest,
  NodeKind,
  ProviderConfig,
  SettingsUpdate,
  Severity,
} from '../contract';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
    staleTime: 0,
  });
}

export function useProject(pid: string | undefined) {
  return useQuery({
    queryKey: ['project', pid],
    queryFn: () => api.projects.get(pid!),
    enabled: Boolean(pid),
    staleTime: 0,
    refetchInterval: (q) => (q.state.data?.status === 'indexing' ? 5000 : false),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
    staleTime: 0,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (u: SettingsUpdate) => api.settings.update(u),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data);
    },
  });
}

export function useTestProvider() {
  return useMutation({
    mutationFn: (provider?: ProviderConfig) => api.settings.test(provider),
  });
}

export function useProvidersDetect() {
  return useQuery({
    queryKey: ['providers-detect'],
    queryFn: () => api.providersDetect(),
    staleTime: 30_000,
  });
}

export function useBrowse(path?: string) {
  return useQuery({
    queryKey: ['fs-browse', path ?? ''],
    queryFn: () => api.browse(path),
    staleTime: 10_000,
  });
}

// The server resolves the project's configured language when a link has no override.
function useQueryLanguage(fallback?: Lang) {
  const [params] = useSearchParams();
  return Lang.safeParse(params.get('lang')).data ?? fallback;
}

export function useOverview(pid: string | undefined, fallback?: Lang) {
  const lang = useQueryLanguage(fallback);
  return useQuery({
    queryKey: ['overview', pid, lang],
    queryFn: () => api.overview(pid!, lang),
    enabled: Boolean(pid),
  });
}

export function useFeatures(pid: string | undefined, fallback?: Lang) {
  const lang = useQueryLanguage(fallback);
  return useQuery({
    queryKey: ['features', pid, lang],
    queryFn: () => api.features.list(pid!, lang),
    enabled: Boolean(pid),
  });
}

export function useFeature(
  pid: string | undefined,
  fid: string | undefined,
  fallback?: Lang,
) {
  const lang = useQueryLanguage(fallback);
  return useQuery({
    queryKey: ['feature', pid, fid, lang],
    queryFn: () => api.features.get(pid!, fid!, lang),
    enabled: Boolean(pid && fid),
  });
}

export function useTree(pid: string | undefined, path?: string, depth?: number) {
  return useQuery({
    queryKey: ['tree', pid, path ?? '', depth ?? null],
    queryFn: () => api.tree(pid!, path, depth),
    enabled: Boolean(pid),
  });
}

export function useNode(
  pid: string | undefined,
  nodeId: string | undefined,
  fallback?: Lang,
) {
  const lang = useQueryLanguage(fallback);
  return useQuery({
    queryKey: ['node', pid, nodeId, lang],
    queryFn: () => api.node(pid!, nodeId!, lang),
    enabled: Boolean(pid && nodeId),
  });
}

export function useSource(
  pid: string | undefined,
  nodeId: string | undefined,
  range?: { start: number; end: number },
) {
  return useQuery({
    queryKey: ['source', pid, nodeId, range?.start ?? null, range?.end ?? null],
    queryFn: () => api.source(pid!, nodeId!, range),
    enabled: Boolean(pid && nodeId),
  });
}

export function useImpact(
  pid: string | undefined,
  nodeId: string | undefined,
  direction: 'up' | 'down' | 'both' = 'both',
  depth = 3,
  kinds?: EdgeKind[],
) {
  return useQuery({
    queryKey: ['impact', pid, nodeId, direction, depth, kinds?.join(',') ?? ''],
    queryFn: () => api.impact(pid!, nodeId!, { direction, depth, kinds }),
    enabled: Boolean(pid && nodeId),
  });
}

export function useGraph(pid: string | undefined, q: Partial<GraphQuery>) {
  const paramsHash = JSON.stringify(q);
  return useQuery({
    queryKey: ['graph', pid, paramsHash],
    queryFn: () => api.graph(pid!, q),
    enabled: Boolean(pid),
  });
}

export function useFind(
  pid: string | undefined,
  q: string,
  o?: { kinds?: NodeKind[]; limit?: number },
) {
  return useQuery({
    queryKey: ['find', pid, q, o?.kinds?.join(',') ?? '', o?.limit ?? 20],
    queryFn: () => api.find(pid!, q, o),
    enabled: Boolean(pid && q.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useSearch(
  pid: string | undefined,
  q: string,
  o?: { kind?: NodeKind; limit?: number },
) {
  return useQuery({
    queryKey: ['search', pid, q, o?.kind ?? ''],
    queryFn: () => api.search(pid!, q, o),
    enabled: Boolean(pid && q.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useHealth(
  pid: string | undefined,
  f?: { severity?: Severity; rule?: string; feature?: string },
) {
  const filtersHash = JSON.stringify(f ?? {});
  return useQuery({
    queryKey: ['health', pid, filtersHash],
    queryFn: () => api.projectHealth(pid!, f),
    enabled: Boolean(pid),
  });
}

export function useStartIndex(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req?: IndexRequest) => api.index.start(pid, req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', pid] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDiffImpact(
  pid: string | undefined,
  req: { base?: string; narrative?: boolean; lang?: Lang },
) {
  const lang = useQueryLanguage(req.lang);
  return useQuery({
    queryKey: ['diff-impact', pid, req.base ?? '', req.narrative ?? true, lang ?? null],
    queryFn: () => api.diffImpact(pid!, { ...req, lang }),
    enabled: Boolean(pid),
  });
}
