import type { FixtureIndex } from './fixture-schema';
import type {
  AskRequest,
  GraphQuery,
  NodeKind,
  SettingsUpdate,
  Severity,
} from '../src/api/contract';

export interface MockResult {
  status: number;
  headers?: Record<string, string>;
  json?: unknown;
  sse?: { event: string; data: unknown; delayMs: number }[];
}

function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const pSegs = pattern.split('/').filter(Boolean);
  const uSegs = pathname.split('/').filter(Boolean);
  if (pSegs.length !== uSegs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSegs.length; i++) {
    const p = pSegs[i]!;
    const u = uSegs[i]!;
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(u);
    } else if (p !== u) {
      return null;
    }
  }
  return params;
}

export function handleMock(
  f: FixtureIndex,
  req: { method: string; url: string; body?: unknown },
): MockResult {
  const method = req.method.toUpperCase();
  const parsedUrl = new URL(req.url, 'http://127.0.0.1');
  const pathname = parsedUrl.pathname;
  const sp = parsedUrl.searchParams;

  const projectHeaders = { 'X-Catalyst-Index': f.run.id };

  if (method === 'GET' && pathname === '/api/health') {
    return { status: 200, json: { ok: true, version: '0.1.0-mock', mock: true } };
  }

  if (method === 'GET' && pathname === '/api/settings') {
    return { status: 200, json: f.settings };
  }

  if (method === 'PUT' && pathname === '/api/settings') {
    const u = (req.body ?? {}) as SettingsUpdate;
    const next = {
      ...f.settings,
      models: { ...f.settings.models, ...(u.models ?? {}) },
      outputLanguage: u.outputLanguage ?? f.settings.outputLanguage,
      budgetUsd: u.budgetUsd !== undefined ? u.budgetUsd : f.settings.budgetUsd,
      concurrency: u.concurrency ?? f.settings.concurrency,
    };
    return { status: 200, json: next };
  }

  if (method === 'POST' && pathname === '/api/settings/test-provider') {
    return {
      status: 200,
      json: {
        ok: true,
        model: f.settings.models.fast,
        latencyMs: 320,
        message: 'Connected (mock)',
      },
    };
  }

  if (method === 'GET' && pathname === '/api/providers/detect') {
    return { status: 200, json: f.providersDetect };
  }

  if (method === 'GET' && pathname === '/api/fs/browse') {
    return { status: 200, json: f.fsBrowse };
  }

  if (method === 'GET' && pathname === '/api/projects') {
    return { status: 200, json: f.projects };
  }

  if (method === 'POST' && pathname === '/api/projects') {
    const body = (req.body ?? {}) as { path?: string };
    const existing = f.projects.find((p) => p.root === body.path) ?? f.projects[0];
    return { status: 200, json: existing };
  }

  let m = matchPath('/api/projects/:pid', pathname);
  if (m) {
    const proj = f.projects.find((p) => p.id === m!.pid);
    if (!proj) {
      return {
        status: 404,
        json: { error: { code: 'PROJECT_NOT_FOUND', message: `Unknown project ${m.pid}` } },
      };
    }
    if (method === 'DELETE') return { status: 200, json: { ok: true } };
    if (method === 'GET') return { status: 200, headers: projectHeaders, json: proj };
  }

  m = matchPath('/api/projects/:pid/index', pathname);
  if (m && method === 'POST') {
    return { status: 202, headers: projectHeaders, json: { runId: f.run.id } };
  }

  m = matchPath('/api/projects/:pid/runs/:rid', pathname);
  if (m && method === 'GET') {
    return { status: 200, headers: projectHeaders, json: f.run };
  }

  m = matchPath('/api/projects/:pid/runs/:rid/cancel', pathname);
  if (m && method === 'POST') {
    return { status: 200, headers: projectHeaders, json: { ok: true } };
  }

  m = matchPath('/api/projects/:pid/runs/:rid/events', pathname);
  if (m && method === 'GET') {
    return {
      status: 200,
      headers: projectHeaders,
      sse: f.runEvents.map((ev) => ({
        event: ev.stage === 'done' || ev.stage === 'error' ? ev.stage : 'progress',
        data: ev,
        delayMs: 120,
      })),
    };
  }

  m = matchPath('/api/projects/:pid/estimate', pathname);
  if (m && method === 'POST') {
    return {
      status: 200,
      headers: projectHeaders,
      json: {
        files: f.projects[0]?.stats?.files ?? 129,
        filesNeedingSummary: 12,
        cachedSummaries: 117,
        llmCalls: 16,
        tokens: { in: 42000, out: 6500 },
        costUsd: 0.08,
        model: f.settings.models,
        note: null,
      },
    };
  }

  m = matchPath('/api/projects/:pid/overview', pathname);
  if (m && method === 'GET') {
    return { status: 200, headers: projectHeaders, json: f.overview };
  }

  m = matchPath('/api/projects/:pid/features', pathname);
  if (m && method === 'GET') {
    return { status: 200, headers: projectHeaders, json: f.features };
  }

  m = matchPath('/api/projects/:pid/features/:fid', pathname);
  if (m && method === 'GET') {
    const fid = m.fid ?? '';
    const detail = f.featureDetails[fid];
    if (!detail) {
      return {
        status: 404,
        headers: projectHeaders,
        json: { error: { code: 'NODE_NOT_FOUND', message: `Unknown feature ${fid}` } },
      };
    }
    return { status: 200, headers: projectHeaders, json: detail };
  }

  m = matchPath('/api/projects/:pid/tree', pathname);
  if (m && method === 'GET') {
    return { status: 200, headers: projectHeaders, json: f.tree };
  }

  m = matchPath('/api/projects/:pid/nodes/:id', pathname);
  if (m && method === 'GET') {
    const id = m.id ?? '';
    const xray = f.nodes[id] ?? Object.values(f.nodes)[0];
    if (!xray) {
      return {
        status: 404,
        headers: projectHeaders,
        json: { error: { code: 'NODE_NOT_FOUND', message: `Unknown node ${id}` } },
      };
    }
    return { status: 200, headers: projectHeaders, json: xray };
  }

  m = matchPath('/api/projects/:pid/nodes/:id/source', pathname);
  if (m && method === 'GET') {
    const id = m.id ?? '';
    const src =
      f.sources[id] ??
      f.sources[`file:${f.nodes[id]?.node.filePath ?? ''}`] ??
      Object.values(f.sources)[0];
    if (!src) {
      return {
        status: 404,
        headers: projectHeaders,
        json: { error: { code: 'NODE_NOT_FOUND', message: `Source not found for ${id}` } },
      };
    }
    return { status: 200, headers: projectHeaders, json: src };
  }

  m = matchPath('/api/projects/:pid/nodes/:id/impact', pathname);
  if (m && method === 'GET') {
    const id = m.id ?? '';
    const imp = f.impact[id] ?? Object.values(f.impact)[0];
    if (!imp) {
      return {
        status: 404,
        headers: projectHeaders,
        json: { error: { code: 'NODE_NOT_FOUND', message: `Impact not found for ${id}` } },
      };
    }
    return { status: 200, headers: projectHeaders, json: imp };
  }

  m = matchPath('/api/projects/:pid/graph', pathname);
  if (m && method === 'GET') {
    const level = (sp.get('level') ?? 'file') as GraphQuery['level'];
    const base = level === 'feature' ? f.graph.feature : f.graph.file;
    const featureFilter = sp.get('feature');
    const edgeKinds = sp.get('edgeKinds')?.split(',').filter(Boolean);
    const nodeKinds = sp.get('nodeKinds')?.split(',').filter(Boolean);
    const provenance = sp.get('provenance')?.split(',').filter(Boolean);

    let nodes = base.nodes;
    if (featureFilter) {
      nodes = nodes.filter(
        (n) => n.featureId === featureFilter || n.id === featureFilter,
      );
    }
    if (nodeKinds?.length) {
      nodes = nodes.filter((n) => nodeKinds.includes(n.kind));
    }
    const idSet = new Set(nodes.map((n) => n.id));
    let edges = base.edges.filter(
      (e) => idSet.has(e.source) && idSet.has(e.target),
    );
    if (edgeKinds?.length) {
      edges = edges.filter((e) => edgeKinds.includes(e.kind));
    }
    if (provenance?.length) {
      edges = edges.filter((e) => provenance.includes(e.provenance));
    }

    return {
      status: 200,
      headers: projectHeaders,
      json: { ...base, nodes, edges },
    };
  }

  m = matchPath('/api/projects/:pid/find', pathname);
  if (m && method === 'GET') {
    const q = (sp.get('q') ?? '').trim().toLowerCase();
    const kinds = sp.get('kinds')?.split(',').filter(Boolean) as NodeKind[] | undefined;
    const exact = f.find[q];
    let results = exact ?? f.find['*'] ?? [];
    if (!exact && q) {
      const matched = Object.values(f.find)
        .flat()
        .filter(
          (r) =>
            r.node.name.toLowerCase().includes(q) ||
            (r.node.filePath?.toLowerCase().includes(q) ?? false),
        );
      if (matched.length > 0) {
        const seen = new Set<string>();
        results = matched.filter((r) =>
          seen.has(r.node.id) ? false : (seen.add(r.node.id), true),
        );
      }
    }
    if (kinds?.length) {
      results = results.filter((r) => kinds.includes(r.node.kind));
    }
    return { status: 200, headers: projectHeaders, json: results };
  }

  m = matchPath('/api/projects/:pid/search', pathname);
  if (m && method === 'GET') {
    const q = (sp.get('q') ?? '').trim().toLowerCase();
    const kind = sp.get('kind');
    const exact = f.search[q];
    let results = exact ?? f.search['*'] ?? [];
    if (!exact && q) {
      const matched = Object.values(f.search)
        .flat()
        .filter(
          (r) =>
            r.node.name.toLowerCase().includes(q) ||
            r.snippet.toLowerCase().includes(q) ||
            (r.purpose?.toLowerCase().includes(q) ?? false),
        );
      if (matched.length > 0) {
        const seen = new Set<string>();
        results = matched.filter((r) =>
          seen.has(r.node.id) ? false : (seen.add(r.node.id), true),
        );
      }
    }
    if (kind) {
      results = results.filter((r) => r.node.kind === kind);
    }
    return { status: 200, headers: projectHeaders, json: results };
  }

  m = matchPath('/api/projects/:pid/ask', pathname);
  if (m && method === 'POST') {
    const body = (req.body ?? {}) as Partial<AskRequest>;
    const q = (body.question ?? '').trim();
    const script =
      f.askScripts[q] ??
      Object.entries(f.askScripts).find(
        ([k]) => k !== '*' && k.toLowerCase() === q.toLowerCase(),
      )?.[1] ??
      f.askScripts['*'] ??
      [];
    return {
      status: 200,
      headers: projectHeaders,
      sse: script.map((ev) => ({
        event: ev.type,
        data: ev,
        delayMs: ev.type === 'token' ? 40 : 100,
      })),
    };
  }

  m = matchPath('/api/projects/:pid/health', pathname);
  if (m && method === 'GET') {
    const severity = sp.get('severity') as Severity | null;
    const rule = sp.get('rule');
    let flags = f.health.flags;
    if (severity) flags = flags.filter((fl) => fl.severity === severity);
    if (rule) flags = flags.filter((fl) => fl.rule === rule);
    return {
      status: 200,
      headers: projectHeaders,
      json: { ...f.health, flags },
    };
  }

  return {
    status: 404,
    json: { error: { code: 'NODE_NOT_FOUND', message: `No mock route for ${method} ${pathname}` } },
  };
}
