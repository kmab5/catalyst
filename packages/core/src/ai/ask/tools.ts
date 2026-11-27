import { EdgeKind, NodeKind, ids, type Lang } from '@catalyst/shared';
import { z } from 'zod';
import type { QueryApi } from '../../query/types.js';
import type { ToolDef } from '../providers/types.js';
import { redactSecrets, privatePath } from '../redact.js';
function limited(value: unknown) {
  const serialize = (v: unknown) =>
    JSON.stringify(v, (_key, item: unknown) => (typeof item === 'string' ? redactSecrets(item) : item));
  const json = serialize(value);
  if (json.length <= 7000) return JSON.parse(json);
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    let chars = 30;
    for (const row of value) {
      const text = serialize(row);
      if (chars + text.length > 6950) break;
      items.push(JSON.parse(text));
      chars += text.length + 1;
    }
    return { items, truncated: true };
  }
  return { excerpt: json.slice(0, 6500), truncated: true };
}
export function askTools(q: QueryApi, lang: Lang = 'en'): Record<string, ToolDef> {
  const id = z.object({ id: z.string() }),
    empty = z.object({}),
    limit = z.number().int().min(1).max(40);
  function def<T extends z.ZodTypeAny>(
    description: string,
    inputSchema: T,
    run: (args: z.output<T>) => unknown,
  ): ToolDef {
    return {
      description,
      inputSchema,
      execute: async (input: unknown) => {
        try {
          return limited(await run(inputSchema.parse(input)));
        } catch {
          return { error: 'No matching indexed data for these arguments.' };
        }
      },
    };
  }
  return {
    find: def(
      'Find indexed files and symbols by name or path.',
      z.object({ query: z.string(), kinds: z.array(NodeKind).optional(), limit: limit.default(10) }),
      (a) => q.find(a.query, a),
    ),
    search: def(
      'Search indexed source, descriptions and tags.',
      z.object({ query: z.string(), limit: limit.default(10) }),
      (a) => q.search(a.query, { limit: a.limit }),
    ),
    get_node: def('Get a node, its purpose, effects and flags.', id, (a) => {
      const x = q.getXRay(a.id, lang);
      return {
        node: x.node,
        summary: x.summary,
        effects: x.sideEffects,
        features: x.features,
        flags: x.flags.map((f) => f.title),
      };
    }),
    get_neighbors: def(
      'Read adjacent dependencies or dependants.',
      id.extend({
        direction: z.enum(['in', 'out', 'both']).default('both'),
        kinds: z.array(EdgeKind).optional(),
        limit: limit.default(25),
      }),
      (a) =>
        q
          .neighbours(a.id, {
            direction: a.direction === 'in' ? 'up' : a.direction === 'out' ? 'down' : 'both',
            edgeKinds: a.kinds,
          })
          .slice(0, a.limit),
    ),
    get_impact: def(
      'Get upstream or downstream impact.',
      id.extend({
        direction: z.enum(['up', 'down', 'both']).default('up'),
        depth: z.number().int().min(1).max(6).default(3),
      }),
      (a) => {
        const r = q.impact(a.id, a);
        return {
          count: r.nodes.length,
          byFeature: r.byFeature,
          routes: r.routes,
          nodes: r.nodes.slice(0, 20),
          truncated: r.truncated || r.nodes.length > 20,
        };
      },
    ),
    list_features: def('List detected application capabilities.', empty, () =>
      q
        .listFeatures(lang)
        .map((f) => ({
          id: f.id,
          name: f.name,
          summary: f.summary,
          entryPoints: q.getFeature(f.id, lang).entryPoints,
        })),
    ),
    get_feature: def('Get feature members and flows.', id, (a) => {
      const f = q.getFeature(a.id, lang);
      return { ...f, members: f.members.slice(0, 40), truncated: f.members.length > 40 };
    }),
    list_routes: def(
      'List routes with handler, database accesses and services.',
      z.object({ method: z.string().optional(), pathContains: z.string().optional() }),
      (a) =>
        q
          .routes({ method: a.method })
          .filter((r) => !a.pathContains || r.id.includes(a.pathContains))
          .map((r) => {
            const handler = q.neighbours(r.id, { direction: 'down', edgeKinds: ['handles'] })[0]?.node;
            const effects = handler
              ? q.neighbours(handler.id, {
                  direction: 'down',
                  edgeKinds: ['reads', 'writes', 'calls_service'],
                })
              : [];
            return {
              id: r.id,
              handler: handler?.id,
              handlerPurpose: handler ? q.getXRay(handler.id, lang).symbolPurpose : null,
              reads: effects.filter((e) => e.kind === 'reads').map((e) => e.node.id),
              writes: effects.filter((e) => e.kind === 'writes').map((e) => e.node.id),
              services: effects.filter((e) => e.kind === 'calls_service').map((e) => e.node.id),
            };
          }),
    ),
    list_db_models: def('List database models with their readers and writers.', empty, () =>
      q.dataAccess(),
    ),
    read_source: def(
      'Read up to 200 lines of indexed source.',
      z.object({
        id: z.string().optional(),
        path: z.string().optional(),
        startLine: z.number().int().positive().optional(),
        endLine: z.number().int().positive().optional(),
      }),
      async (a) => {
        const id = a.id ?? ids.file(a.path ?? ''),
          node = q.getNode(id);
        if (!node.filePath || privatePath(node.filePath)) throw new Error('Unavailable source');
        const start = a.startLine ?? node.startLine ?? 1,
          end = Math.min(start + 199, a.endLine ?? start + 199);
        const r = await q.getSource(id, { start, end });
        return { id, file: r.filePath, start: r.startLine, end: r.endLine, text: r.text };
      },
    ),
  };
}
