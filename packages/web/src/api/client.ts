import { z } from 'zod';
import {
  AskAnswer,
  DiffImpactDTO,
  EdgeKind,
  EstimateDTO,
  FeatureDetailDTO,
  FeatureListItemDTO,
  FindResultDTO,
  FsBrowseDTO,
  GraphQuery,
  GraphResponse,
  HealthDTO,
  HealthResponse,
  ImpactDTO,
  IndexRequest,
  Lang,
  NodeKind,
  OverviewDTO,
  ProjectDTO,
  ProviderConfig,
  ProvidersDetectDTO,
  RunDTO,
  SearchResultDTO,
  SettingsDTO,
  SettingsUpdate,
  SourceDTO,
  TestProviderResult,
  TreeNodeDTO,
  XRayDTO,
  ErrorBody,
} from './contract';
import { ApiError } from './errors';
import { getToken } from './token';

type IndexHeaderListener = (pid: string, runId: string) => void;
const indexHeaderListeners = new Set<IndexHeaderListener>();

export function onIndexHeader(cb: IndexHeaderListener): () => void {
  indexHeaderListeners.add(cb);
  return () => indexHeaderListeners.delete(cb);
}

const serverGoneListeners = new Set<() => void>();
export function reportServerGone() {
  for (const cb of serverGoneListeners) cb();
}

export function onServerGone(cb: () => void): () => void {
  serverGoneListeners.add(cb);
  return () => serverGoneListeners.delete(cb);
}

const serverBackListeners = new Set<() => void>();
export function onServerBack(cb: () => void): () => void {
  serverBackListeners.add(cb);
  return () => serverBackListeners.delete(cb);
}

const isDev = Boolean(import.meta.env?.DEV);

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  if (!isDev) return data as T;
  return schema.parse(data);
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  opts?: { pid?: string; needsToken?: boolean },
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const needsToken =
    opts?.needsToken ?? (method !== 'GET' || path.startsWith('/api/settings'));

  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (needsToken) {
    const tok = getToken();
    if (tok) headers.set('X-Catalyst-Token', tok);
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch (err) {
    reportServerGone();
    throw new ApiError(
      'SERVER_GONE',
      0,
      err instanceof Error ? err.message : 'Network error',
    );
  }

  if (path === '/api/health' && res.ok) {
    for (const cb of serverBackListeners) cb();
  }

  const indexHeader = res.headers.get('X-Catalyst-Index');
  if (indexHeader && opts?.pid) {
    for (const cb of indexHeaderListeners) cb(opts.pid, indexHeader);
  }

  if (!res.ok) {
    let parsed: ErrorBody | null = null;
    try {
      const json = await res.json();
      const check = ErrorBody.safeParse(json);
      if (check.success) parsed = check.data;
    } catch {
      // ignore non-JSON errors
    }
    if (parsed) {
      throw new ApiError(
        parsed.error.code,
        res.status,
        parsed.error.message,
        parsed.error.details,
      );
    }
    throw new ApiError('INTERNAL', res.status, res.statusText || 'Request failed');
  }

  const data = await res.json();
  return validate(schema, data);
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      search.set(k, String(v));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const api = {
  health: () => request('/api/health', HealthResponse),

  settings: {
    get: () => request('/api/settings', SettingsDTO, {}, { needsToken: true }),
    update: (u: SettingsUpdate) =>
      request(
        '/api/settings',
        SettingsDTO,
        { method: 'PUT', body: JSON.stringify(u) },
        { needsToken: true },
      ),
    test: (provider?: ProviderConfig) =>
      request(
        '/api/settings/test-provider',
        TestProviderResult,
        { method: 'POST', body: JSON.stringify(provider ? { provider } : {}) },
        { needsToken: true },
      ),
  },

  providersDetect: () => request('/api/providers/detect', ProvidersDetectDTO),

  browse: (path?: string) =>
    request(`/api/fs/browse${qs({ path })}`, FsBrowseDTO),

  projects: {
    list: () => request('/api/projects', z.array(ProjectDTO)),
    open: (path: string) =>
      request(
        '/api/projects',
        ProjectDTO,
        { method: 'POST', body: JSON.stringify({ path }) },
        { needsToken: true },
      ),
    get: (pid: string) =>
      request(`/api/projects/${encodeURIComponent(pid)}`, ProjectDTO, {}, { pid }),
    forget: (pid: string, purge = false) =>
      request(
        `/api/projects/${encodeURIComponent(pid)}${qs({ purge: purge ? 'true' : undefined })}`,
        z.object({ ok: z.literal(true) }),
        { method: 'DELETE' },
        { needsToken: true },
      ),
  },

  index: {
    start: (pid: string, req?: IndexRequest) =>
      request(
        `/api/projects/${encodeURIComponent(pid)}/index`,
        z.object({ runId: z.string() }),
        { method: 'POST', body: JSON.stringify(req ?? {}) },
        { pid, needsToken: true },
      ),
    run: (pid: string, rid: string) =>
      request(
        `/api/projects/${encodeURIComponent(pid)}/runs/${encodeURIComponent(rid)}`,
        RunDTO,
        {},
        { pid },
      ),
    cancel: (pid: string, rid: string) =>
      request(
        `/api/projects/${encodeURIComponent(pid)}/runs/${encodeURIComponent(rid)}/cancel`,
        z.object({ ok: z.literal(true) }),
        { method: 'POST' },
        { pid, needsToken: true },
      ),
    estimate: (pid: string, language?: Lang) =>
      request(
        `/api/projects/${encodeURIComponent(pid)}/estimate`,
        EstimateDTO,
        { method: 'POST', body: JSON.stringify({ language }) },
        { pid, needsToken: true },
      ),
  },

  overview: (pid: string, lang?: Lang) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/overview${qs({ lang })}`,
      OverviewDTO,
      {},
      { pid },
    ),

  features: {
    list: (pid: string, lang?: Lang) =>
      request(
        `/api/projects/${encodeURIComponent(pid)}/features${qs({ lang })}`,
        z.array(FeatureListItemDTO),
        {},
        { pid },
      ),
    get: (pid: string, fid: string, lang?: Lang) =>
      request(
        `/api/projects/${encodeURIComponent(pid)}/features/${encodeURIComponent(fid)}${qs({ lang })}`,
        FeatureDetailDTO,
        {},
        { pid },
      ),
  },

  tree: (pid: string, path?: string, depth?: number) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/tree${qs({ path, depth })}`,
      TreeNodeDTO,
      {},
      { pid },
    ),

  node: (pid: string, id: string, lang?: Lang) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/nodes/${encodeURIComponent(id)}${qs({ lang })}`,
      XRayDTO,
      {},
      { pid },
    ),

  source: (
    pid: string,
    id: string,
    range?: { start: number; end: number },
  ) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/nodes/${encodeURIComponent(id)}/source${qs({
        start: range?.start,
        end: range?.end,
      })}`,
      SourceDTO,
      {},
      { pid },
    ),

  impact: (
    pid: string,
    id: string,
    o?: { direction?: 'up' | 'down' | 'both'; depth?: number; kinds?: EdgeKind[] },
  ) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/nodes/${encodeURIComponent(id)}/impact${qs({
        direction: o?.direction,
        depth: o?.depth,
        kinds: o?.kinds?.join(','),
      })}`,
      ImpactDTO,
      {},
      { pid },
    ),

  graph: (pid: string, q: Partial<GraphQuery>) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/graph${qs({
        level: q.level,
        focus: q.focus,
        depth: q.depth,
        feature: q.feature,
        edgeKinds: q.edgeKinds?.join(','),
        nodeKinds: q.nodeKinds?.join(','),
        provenance: q.provenance?.join(','),
        limit: q.limit,
      })}`,
      GraphResponse,
      {},
      { pid },
    ),

  find: (pid: string, q: string, o?: { kinds?: NodeKind[]; limit?: number }) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/find${qs({
        q,
        kinds: o?.kinds?.join(','),
        limit: o?.limit,
      })}`,
      z.array(FindResultDTO),
      {},
      { pid },
    ),

  search: (pid: string, q: string, o?: { kind?: NodeKind; limit?: number }) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/search${qs({
        q,
        kind: o?.kind,
        limit: o?.limit,
      })}`,
      z.array(SearchResultDTO),
      {},
      { pid },
    ),

  projectHealth: (
    pid: string,
    f?: { severity?: 'info' | 'warn' | 'high'; rule?: string; feature?: string },
  ) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/health${qs({
        severity: f?.severity,
        rule: f?.rule,
        feature: f?.feature,
      })}`,
      HealthDTO,
      {},
      { pid },
    ),

  diffImpact: (
    pid: string,
    req: { base?: string; narrative?: boolean; lang?: Lang },
  ) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/impact/diff`,
      DiffImpactDTO,
      { method: 'POST', body: JSON.stringify(req) },
      { pid, needsToken: true },
    ),

  asks: (pid: string) =>
    request(
      `/api/projects/${encodeURIComponent(pid)}/asks`,
      z.array(
        z.object({ id: z.string(), question: z.string(), createdAt: z.number() }),
      ),
      {},
      { pid },
    ),

  urls: {
    runEvents: (pid: string, rid: string) =>
      `/api/projects/${encodeURIComponent(pid)}/runs/${encodeURIComponent(rid)}/events`,
    ask: (pid: string) => `/api/projects/${encodeURIComponent(pid)}/ask`,
  },
};

export { AskAnswer };
