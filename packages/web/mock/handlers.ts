import { runsFor, startDemoRun, finishRun, frameDelayMs } from './runs';
import { ids, SettingsUpdate } from '../src/api/contract';
import { demoDiff, graphAt, settingsAfter, treeAt } from './views';
import type { FixtureIndex } from './fixture-schema';
import type {
  AskRequest,
  GraphQuery,
  NodeKind,
  Severity,
} from '../src/api/contract';

export interface MockResult {
  status: number;
  headers?: Record<string, string>;
  json?: unknown;
  onComplete?: () => void;
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

  const runs = runsFor(f);
  const pid = pathname.split('/')[3];
  const project = f.projects.find(p => p.id === pid);
  const projectHeaders = { 'X-Catalyst-Index': project?.lastRunId ?? '' };

  if (method === 'GET' && pathname === '/api/health') {
    return { status: 200, json: { ok: true, version: '0.1.0-mock', mock: true } };
  }

  if (method === 'GET' && pathname === '/api/settings') {
    return { status: 200, json: f.settings };
  }

  if (method === 'PUT' && pathname === '/api/settings') {
    const update = SettingsUpdate.safeParse(req.body);
    if (!update.success) return { status: 400, json: { error: { code: 'BAD_REQUEST', message: 'Invalid settings' } } };
    f.settings = settingsAfter(f.settings, update.data);
    return { status: 200, json: f.settings };
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
    const path = sp.get('path');
    if (!path || path === f.fsBrowse.path) return { status: 200, json: f.fsBrowse };
    const entry = f.fsBrowse.entries.find(e => e.path === path);
    if (entry) return { status: 200, json: { path, parent: f.fsBrowse.path, entries: [] } };
    return { status: 404, json: { error: { code: 'PATH_NOT_FOUND', message: 'Unknown demo directory' } } };
  }

  if (method === 'GET' && pathname === '/api/projects') {
    return { status: 200, json: f.projects };
  }

  if (method === 'POST' && pathname === '/api/projects') {
    const body = (req.body ?? {}) as { path?: string };
    const existing = f.projects.find((p) => p.root === body.path);
    if (!existing) return { status: 404, json: { error: { code: 'PATH_NOT_FOUND', message: 'Unknown demo project' } } };
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
    if (!project) return { status: 404, json: { error: { code: 'PROJECT_NOT_FOUND', message: 'Unknown project' } } };
    if (project.activeRunId) return { status: 409, json: { error: { code: 'INDEX_RUNNING', message: 'Index already running' } } };
    const ai = Boolean(f.settings.provider) && (req.body as {ai?: boolean} | undefined)?.ai !== false;
    return { status: 202, headers: projectHeaders, json: { runId: startDemoRun(f, project, ai).id } };
  }

  for (const suffix of ['', '/cancel', '/events']) {
    m = matchPath('/api/projects/:pid/runs/:rid' + suffix, pathname);
    if (!m) continue;
    const run = runs.get(m.rid ?? '');
    if (!run || run.project.id !== pid) return { status: 404, json: { error: { code: 'PATH_NOT_FOUND', message: 'Unknown run' } } };
    if (suffix === '' && method === 'GET') return { status: 200, headers: projectHeaders, json: run.record };
    if (suffix === '/cancel' && method === 'POST') {
      finishRun(run, true);
      return { status: 200, headers: projectHeaders, json: {ok: true} };
    }
    if (suffix === '/events' && method === 'GET') return {
      status: 200, headers: projectHeaders,
      onComplete: () => finishRun(run),
      sse: run.events.map(ev => ({
        event: ev.stage === 'cancelled' ? 'done' : ['done','error'].includes(ev.stage) ? ev.stage : 'progress',
        data: ev, delayMs: frameDelayMs,
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
        costUsd: f.settings.provider?.type === 'claude-code' ? null : 0.08,
        model: f.settings.models,
        note: f.settings.provider?.type === 'claude-code' ? 'Billed to your Claude plan' : null,
      },
    };
  }

  m = matchPath('/api/projects/:pid/overview', pathname);
  if (m && method === 'GET') {
    return { status: 200, headers: projectHeaders, json: { ...f.overview, project: project ?? f.overview.project,
      ...(project?.aiStatus === 'skipped' ? {overview: null, features: []} : {}),
    } };
  }

  m = matchPath('/api/projects/:pid/features', pathname);
  if (m && method === 'GET') {
    return { status: 200, headers: projectHeaders, json: project?.aiStatus === 'skipped' ? [] : f.features };
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
    const tree = treeAt(f.tree, sp.get('path') ?? '', Number(sp.get('depth') ?? Infinity));
    if (!tree) return { status: 404, json: { error: { code: 'NODE_NOT_FOUND', message: 'Unknown directory' } } };
    return { status: 200, headers: projectHeaders, json: tree };
  }

  m = matchPath('/api/projects/:pid/nodes/:id', pathname);
  if (m && method === 'GET') {
    const id = m.id ?? '';
    const xray = f.nodes[id];
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
    const path = f.nodes[id]?.node.filePath;
    const src = f.sources[id] ?? (path ? f.sources[ids.file(path)] : undefined);
    if (!src) {
      return {
        status: 404,
        headers: projectHeaders,
        json: { error: { code: 'NODE_NOT_FOUND', message: `Source not found for ${id}` } },
      };
    }
    const startLine = Math.max(src.startLine, Number(sp.get('start') ?? src.startLine));
    const endLine = Math.min(src.endLine, Number(sp.get('end') ?? src.endLine));
    const text = src.text.split('\n').slice(startLine - src.startLine, endLine - src.startLine + 1).join('\n');
    return { status: 200, headers: projectHeaders, json: { ...src, nodeId: id, startLine, endLine, text } };
  }

  m = matchPath('/api/projects/:pid/nodes/:id/impact', pathname);
  if (m && method === 'GET') {
    const id = m.id ?? '';
    const imp = f.impact[id] ?? (f.nodes[id] && {
      root: id, nodes: [], edges: [], byFeature: [], routes: [], truncated: false,
    });
    if (!imp) {
      return {
        status: 404,
        headers: projectHeaders,
        json: { error: { code: 'NODE_NOT_FOUND', message: `Impact not found for ${id}` } },
      };
    }
    const direction = sp.get('direction') ?? 'both';
    const depth = Number(sp.get('depth') ?? 3);
    const nodes = imp.nodes.filter(n => n.distance <= depth && (direction === 'both' || n.direction === direction));
    const included = new Set(nodes.map(n => n.id));
    const counts = new Map<string, number>();
    for (const node of nodes) for (const feature of f.nodes[node.id]?.features ?? []) {
      counts.set(feature.id, (counts.get(feature.id) ?? 0) + 1);
    }
    return { status: 200, headers: projectHeaders, json: { ...imp, direction, depth, nodes,
      edges: imp.edges.filter(e => included.has(e.node.id)), routes: imp.routes.filter(id => included.has(id)),
      byFeature: [...counts].map(([featureId, count]) => ({featureId, count})),
    } };
  }

  m = matchPath('/api/projects/:pid/graph', pathname);
  if (m && method === 'GET') {
    const level = (sp.get('level') ?? 'file') as GraphQuery['level'];
    const base = level === 'feature' ? f.graph.feature : f.graph.file;
    return { status: 200, headers: projectHeaders, json: graphAt(base, sp) };
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
      {
        const seen = new Set<string>();
        results = matched.filter((r) =>
          seen.has(r.node.id) ? false : (seen.add(r.node.id), true),
        );
      }
    }
    if (kinds?.length) {
      results = results.filter((r) => kinds.includes(r.node.kind));
    }
    return { status: 200, headers: projectHeaders, json: results.slice(0, Number(sp.get('limit') ?? results.length)) };
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
      {
        const seen = new Set<string>();
        results = matched.filter((r) =>
          seen.has(r.node.id) ? false : (seen.add(r.node.id), true),
        );
      }
    }
    if (kind) {
      results = results.filter((r) => r.node.kind === kind);
    }
    return { status: 200, headers: projectHeaders, json: results.slice(0, Number(sp.get('limit') ?? results.length)) };
  }

  m = matchPath('/api/projects/:pid/ask', pathname);
  if (m && method === 'POST') {
    if (!f.settings.provider) return { status: 412, json: { error: { code: 'AI_NOT_CONFIGURED', message: 'Connect an AI provider in Settings.' } } };
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

  m = matchPath('/api/projects/:pid/impact/diff', pathname);
  if (m && method === 'POST') return { status: 200, json: demoDiff(f, (req.body as {base?: string} | undefined)?.base) };

  m = matchPath('/api/projects/:pid/health', pathname);
  if (m && method === 'GET') {
    const severity = sp.get('severity') as Severity | null;
    const rule = sp.get('rule');
    let flags = f.health.flags;
    if (severity) flags = flags.filter((fl) => fl.severity === severity);
    const feature = sp.get('feature');
    if (feature) flags = flags.filter(flag => f.nodes[flag.node.id]?.features.some(item => item.id === feature));
    if (rule) flags = flags.filter((fl) => fl.rule === rule);
    const summary: typeof f.health.summary = {high: 0, warn: 0, info: 0, byRule: {}};
    for (const flag of flags) {
      summary[flag.severity]++;
      summary.byRule[flag.rule] = (summary.byRule[flag.rule] ?? 0) + 1;
    }
    return {
      status: 200,
      headers: projectHeaders,
      json: { ...f.health, flags, summary, cycles: flags.some(f => f.rule === 'cycle') ? f.health.cycles : [] },
    };
  }

  return {
    status: 404,
    json: { error: { code: 'NODE_NOT_FOUND', message: `No mock route for ${method} ${pathname}` } },
  };
}
