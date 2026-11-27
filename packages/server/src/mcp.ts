import type { Readable } from 'node:stream';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CatalystError, type Engine, type IndexRun, type Project } from '@catalyst/core';
import { ids, NodeKind, Severity } from '@catalyst/shared';
import { z } from 'zod';
import { publicError } from './errors.js';

const instructions = 'Catalyst has indexed this repository into a graph of files, symbols, routes, DB models, env vars, external services and AI-discovered features. Prefer these tools over grep for: where something is implemented, who calls/depends on a symbol, what a change would affect, and architectural issues. Node IDs look like file:src/a.ts, sym:src/a.ts#fn, route:POST /api/x, db:prisma:User, feature:billing.';

function result(value: unknown, stale: boolean) {
  let truncated = false;
  function cap(item: unknown): unknown {
    if (Array.isArray(item)) {
      if (item.length > 50) truncated = true;
      return item.slice(0, 50).map(cap);
    }
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, val]) => [key, cap(val)]));
    return item;
  }
  let data = cap(value);
  if (stale || truncated) {
    const base = data && typeof data === 'object' && !Array.isArray(data) ? data : { items: data };
    data = { ...base, ...(stale ? { stale } : {}), ...(truncated ? { truncated } : {}) };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
export function createMcpServer(project: Project) {
  const server = new McpServer({ name: 'catalyst', version: '0.1.0' }, { instructions });
  const q = project.query;
  const lang = () => project.info().outputLanguage;
  const id = z.string().min(1);
  const limit = z.number().int().positive().max(50).default(50);
  const register = <Shape extends z.ZodRawShape>(name: string, description: string, shape: Shape,
    handle: (args: z.output<z.ZodObject<Shape>>, signal: AbortSignal) => unknown) => {
    const schema = z.object(shape);
    server.registerTool(name, { description, inputSchema: shape as z.ZodRawShape }, async (raw, extra) => {
      try { return result(await handle(schema.parse(raw), extra.signal), project.info().status === 'stale'); }
      catch (error) { return { isError: true, ...result(publicError(error).body, false) }; }
    });
  };
  register('get_overview', 'High-level summary of the app, stack, features, entry points and gaps. Call first in an unfamiliar repo.', {}, () => {
    const overview = q.getOverview(lang());
    const { root: _root, ...safe } = overview.project;
    return { ...overview, project: safe };
  });
  register('list_features', 'List features with IDs for get_feature.', {}, () => q.listFeatures(lang()));
  register('get_feature', 'Show a feature, its members, request flows, dependencies and changeability.', { featureId: id }, a => q.getFeature(a.featureId, lang()));
  register('find_symbol', 'Fuzzy-find files, functions, classes, components and routes by name.', { name: id, kinds: z.array(NodeKind).optional(), limit },
    a => q.find(a.name, { kinds: a.kinds, limit: a.limit }));
  register('search', 'Full-text search over names, paths, code and summaries.', { query: id, kind: NodeKind.optional(), limit },
    a => q.search(a.query, { kind: a.kind, limit: a.limit }));
  register('get_symbol_context', 'Show purpose, connections, side effects, features and flags for a node or path.', { id, includeSource: z.boolean().optional() }, async a => {
    const nodeId = /^(dir|file|sym|route|db|env|pkg|svc|feature):/.test(a.id) ? a.id : ids.file(a.id);
    const xray = q.getXRay(nodeId, lang());
    if (!a.includeSource || !xray.node.filePath) return xray;
    const start = xray.node.startLine ?? 1;
    return { ...xray, source: (await q.getSource(nodeId, { start, end: Math.min(start + 119, xray.node.endLine ?? Infinity) })).text };
  });
  register('get_blast_radius', 'Identify upstream and downstream dependants grouped by feature and route.', {
    id, direction: z.enum(['up','down','both']).default('both'), depth: z.number().int().min(1).max(6).default(3),
  }, a => q.impact(a.id, { direction: a.direction, depth: a.depth }));
  register('find_architectural_issues', 'Show structural flags and cycles. Filter by severity, rule, path or feature.', {
    severity: Severity.optional(), rule: id.optional(), featureId: id.optional(), path: id.optional(),
  }, a => {
    const { flags, cycles } = q.getHealth(a);
    if (!a.path) return { flags, cycles };
    const path = a.path.replace(/\\/g, '/');
    const matches = (f: string | null) => f === path || !!f?.startsWith(path.replace(/\/$/, '') + '/');
    return { flags: flags.filter(f => matches(f.node.filePath)), cycles: cycles.filter(c => c.nodes.some(n => matches(n.filePath))) };
  });
  register('get_diff_impact', 'Map changed lines to symbols, features, routes and flags.', { base: id.optional() }, async a =>
    ({ ...await q.diffImpact(a), narrative: null }));
  register('ask', 'Ask a free-form question and receive cited node IDs and search evidence.', { question: id }, async (a, signal) => {
    for await (const event of project.ask(a, signal)) {
      if (event.type === 'done') return event.answer;
      if (event.type === 'error') throw new CatalystError('PROVIDER_ERROR', event.message);
    }
    throw new CatalystError('PROVIDER_ERROR', 'No answer received');
  });
  return server;
}
export function startMcp(engine: Engine, path: string, signal?: AbortSignal): Promise<void> {
  return connectStdio(engine, path, process.stdin, signal);
}

export async function connectStdio(engine: Engine, path: string, input: Readable, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted || input.readableEnded || input.destroyed) return;
  let stopped = false;
  let run: IndexRun | undefined;
  let server: McpServer | undefined;

  // Notice an empty pipe closing during the initial index without consuming client messages.
  const pollEnd = () => { input.read(0); };
  function detach() {
    input.off('readable', pollEnd);
    input.off('end', stop);
    input.off('close', stop);
    input.off('error', stop);
    signal?.removeEventListener('abort', stop);
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    detach();
    run?.cancel();
    void server?.close().catch(() => {});
  }

  input.on('readable', pollEnd);
  input.once('end', stop);
  input.once('close', stop);
  input.once('error', stop);
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const project = await engine.projects.open(path);
    if (stopped) return;
    if (project.info().status === 'never-indexed') {
      console.error('Indexing project structure…');
      run = project.index({ ai: false });
      if (stopped) run.cancel();
      const result = await run.done;
      run = undefined;
      if (stopped) return;
      if (result.status !== 'done') throw new CatalystError('INTERNAL', 'Structural index did not complete');
    }
    input.off('readable', pollEnd);
    server = createMcpServer(project);
    server.server.onclose = detach;
    await server.connect(new StdioServerTransport(input));
  } catch (err) {
    stop();
    throw err;
  }
}
