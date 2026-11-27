import {
  ids,
  type Feature,
  type FeatureDetailDTO,
  type NodeDTO,
  type ProjectDTO,
  type TreeNodeDTO,
  type SideEffect,
  type HealthDTO,
  type FileSummary,
  type Lang,
  type FindResultDTO,
  type SearchResultDTO,
} from '@catalyst/shared';
import type { QueryApi } from './types.js';
import type { Store } from '../store/index.js';
import { LocalPathSource } from '../project/local.js';
import { CatalystError } from '../errors.js';
import { catalog, need, ref, features, summary, type Catalog } from './catalog.js';
import { adjacent, edgeRef, graphView, impact, paths } from './traverse.js';
import { diffImpact } from './diff.js';

export function createQueryApi(
  store: Store,
  source: LocalPathSource,
  project: () => ProjectDTO,
): QueryApi {
  let cached: Catalog | undefined, revision = '';
  function c() {
    // total_changes is local to this connection. data_version also sees CLI/MCP writes.
    const changes = store.one<{ revision: string }>(
      "SELECT total_changes() || ':' || data_version AS revision FROM pragma_data_version"
    )!.revision;
    if (!cached || changes !== revision) {
      cached = catalog(store);
      revision = changes;
    }
    return cached;
  }
  function membersOf(node: NodeDTO) {
    const n = [node.id, ...(node.filePath ? [ids.file(node.filePath)] : [])];
    return new Set(
      n.flatMap((id) =>
        (c().outgoing.get(id) ?? []).filter((e) => e.kind === 'member_of').map((e) => e.dst),
      ),
    );
  }
  function health(filter: Parameters<QueryApi['getHealth']>[0] = {}): HealthDTO {
    const data = c(),
      flags = data.flags.filter(
        (f) =>
          (!filter.rule || f.rule === filter.rule) &&
          (!filter.severity || f.severity === filter.severity) &&
          (!filter.featureId || membersOf(need(data, f.node.id)).has(filter.featureId)),
      );
    const totals: HealthDTO['summary'] = { high: 0, warn: 0, info: 0, byRule: {} };
    for (const f of flags) {
      totals[f.severity]++;
      totals.byRule[f.rule] = (totals.byRule[f.rule] ?? 0) + 1;
    }
    function top(metric: string, kind: string) {
      return [...data.nodes.values()]
        .filter((n) => n.kind === kind && n.metrics[metric] !== undefined)
        .sort((a, b) => b.metrics[metric]! - a.metrics[metric]!)
        .slice(0, 10)
        .map((n) => ({ node: ref(n), value: n.metrics[metric]! }));
    }
    const cycleKeys = new Set<string>();
    const cycles = flags
      .filter((f) => f.rule === 'cycle')
      .flatMap((f) => {
        const ids = f.evidence.cycle ?? f.evidence.nodeIds ?? [],
          key = [...new Set(ids)].sort().join('\n');
        if (cycleKeys.has(key)) return [];
        cycleKeys.add(key);
        const nodes = [...new Set(ids)].flatMap((id) => (data.nodes.has(id) ? [ref(need(data, id))] : []));
        return [{ id: f.id, nodes, size: nodes.length }];
      });
    return {
      summary: totals,
      flags,
      cycles,
      metrics: {
        topFanIn: top('fan_in', 'file'),
        topComplexity: top('complexity', 'symbol'),
        largestFiles: top('loc', 'file'),
        featureCoupling: [...data.nodes.values()]
          .filter((n) => n.kind === 'feature')
          .flatMap((n) =>
            Object.entries(n.metrics)
              .filter(([k]) => k.startsWith('coupling:'))
              .map(([k, edges]) => ({ from: n.id, to: k.slice(9), edges })),
          ),
      },
    };
  }
  function featureList(lang: Lang) {
    return features(store, lang)
      .sort(
        (a, b) =>
          Number(a.id === ids.feature('shared')) - Number(b.id === ids.feature('shared')) ||
          a.name.localeCompare(b.name),
      )
      .map((f) => {
        const members = new Set(f.members.map((m) => m.nodeId));
        return {
          id: f.id,
          name: f.name,
          category: f.category,
          summary: f.summary,
          memberCount: f.members.length,
          entryPointCount: f.entryPoints.length,
          flowCount: f.flows.length,
          flagCount: c().flags.filter((flag) => members.has(flag.node.id)).length,
          colorIndex: [...f.id].reduce((h, char) => (h * 31 + char.charCodeAt(0)) >>> 0, 0) % 10,
          changeabilityRating: f.changeability?.changeEase.level ?? null,
        };
      });
  }
  const query: QueryApi = {
    getProject: project,
    getStack: () => JSON.parse(store.meta.get('stack_json') ?? '[]'),
    getOverview(lang) {
      const h = health(),
        row = store.one<{ json: string }>('SELECT json FROM overview WHERE language=?', lang);
      return {
        project: project(),
        stack: query.getStack(),
        features: featureList(lang),
        overview: row ? JSON.parse(row.json) : null,
        entryPoints: query.routes().slice(0, 30),
        health: {
          high: h.summary.high,
          warn: h.summary.warn,
          info: h.summary.info,
          topFlags: h.flags.slice(0, 5),
        },
      };
    },
    listFeatures: featureList,
    getFeature(id, lang): FeatureDetailDTO {
      const found = store.one<{ json: string }>(
        'SELECT json FROM features WHERE id=? AND language=?',
        id,
        lang,
      );
      if (!found) throw new CatalystError('NODE_NOT_FOUND', 'Unknown feature: ' + id);
      const f = JSON.parse(found.json) as Feature;
      return {
        ...f,
        members: f.members.flatMap((m) => {
          const n = c().nodes.get(m.nodeId);
          return n ? [{ ...m, node: ref(n) }] : [];
        }),
      };
    },
    featuresOf(id) {
      const node = need(c(), id);
      const members = membersOf(node);
      if (!members.size) return [];
      return features(store, project().outputLanguage)
        .filter((f) => members.has(f.id))
        .map((f) => ({
          id: f.id,
          name: f.name,
          role:
            f.members.find(
              (m) => m.nodeId === id || (node.filePath && m.nodeId === ids.file(node.filePath)),
            )?.role ?? 'support',
        }));
    },
    getNode: (id) => need(c(), id),
    flagsFor: (id) => c().flags.filter((f) => f.node.id === id),
    getXRay(id, lang) {
      const node = query.getNode(id),
        file = node.filePath ? ids.file(node.filePath) : id;
      const s = summary(store, node.kind === 'symbol' ? file : id, lang),
        fileSummary = s && 'symbols' in s ? s : null;
      const downstream = query.neighbours(id, { direction: 'down' }),
        upstream = query.neighbours(id, { direction: 'up' });
      const sideEffects: SideEffect[] = [...(fileSummary?.sideEffects ?? [])];
      const types = {
        reads: 'db_read',
        writes: 'db_write',
        uses_env: 'env',
        calls_service: 'network',
      } as const;
      const effectEdges =
        node.kind === 'file'
          ? [
              ...downstream,
              ...query
                .listNodes({ filePath: node.filePath ?? '', kinds: ['symbol'] })
                .flatMap((n) =>
                  query.neighbours(n.id, {
                    direction: 'down',
                    edgeKinds: ['reads', 'writes', 'uses_env', 'calls_service'],
                  }),
                ),
            ]
          : downstream;
      for (const e of effectEdges) {
        const kind = types[e.kind as keyof typeof types];
        if (kind && !sideEffects.some((s) => s.kind === kind && s.target === e.node.id))
          sideEffects.push({
            kind,
            description:
              (
                {
                  reads: 'Reads ',
                  writes: 'Writes ',
                  uses_env: 'Uses environment variable ',
                  calls_service: 'Contacts ',
                } as Record<string, string>
              )[e.kind] + e.node.name,
            target: e.node.id,
          });
      }
      const blast = query.impact(id, { direction: 'up', depth: 3 });
      return {
        node,
        summary: s,
        symbolPurpose: fileSummary?.symbols.find((s) => s.nodeId === id)?.purpose ?? null,
        features: query.featuresOf(id),
        upstream,
        downstream,
        sideEffects,
        flags: query.flagsFor(id),
        impactPreview: {
          dependants: blast.nodes.length,
          features: blast.byFeature.map((f) => f.featureId),
          routes: blast.routes,
        },
      };
    },
    async getSource(id, range) {
      const n = query.getNode(id);
      if (!n.filePath) throw new CatalystError('BAD_REQUEST', 'This node has no source file');
      const lines = (await source.readFile(n.filePath)).split(/\r?\n/);
      const start = Math.min(lines.length, Math.max(1, range?.start ?? n.startLine ?? 1)),
        end = Math.min(
          lines.length,
          start + 1999,
          Math.max(start, range?.end ?? n.endLine ?? lines.length),
        );
      return {
        nodeId: id,
        filePath: n.filePath,
        language:
          store.one<{ language: string }>('SELECT language FROM files WHERE path=?', n.filePath)
            ?.language ?? 'unknown',
        startLine: start,
        endLine: end,
        totalLines: lines.length,
        text: lines.slice(start - 1, end).join('\n'),
        outline: query
          .listNodes({ kinds: ['symbol'], filePath: n.filePath })
          .map((n) => query.getNode(n.id))
          .map((s) => ({
            nodeId: s.id,
            name: s.name,
            symbolKind: s.symbolKind ?? 'variable',
            startLine: s.startLine ?? 1,
            endLine: s.endLine ?? 1,
            depth: s.symbolKind === 'method' ? 1 : 0,
          }))
          .sort((a, b) => a.startLine - b.startLine),
      };
    },
    getTree(path = '', depth = Infinity) {
      const data = c(),
        root = need(data, ids.dir(path)),
        lang = project().outputLanguage;
      const languages = new Map(
        store
          .all<{ path: string; language: string }>('SELECT path,language FROM files')
          .map((f) => [f.path, f.language]),
      );
      const roles = new Map(
        store
          .all<{
            node_id: string;
            json: string;
          }>("SELECT node_id,json FROM summaries WHERE language=? AND kind='file'", lang)
          .map((r) => [r.node_id, (JSON.parse(r.json) as FileSummary).role]),
      );
      const counts = new Map<string, number>();
      for (const f of data.flags) {
        const id = f.node.filePath ? ids.file(f.node.filePath) : f.node.id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      function tree(n: NodeDTO, d: number): TreeNodeDTO {
        const dir = n.kind === 'directory',
          path = ids.parse(n.id).path ?? '';
        const children = dir
          ? (data.outgoing.get(n.id) ?? [])
              .filter((e) => e.kind === 'contains')
              .map((e) => need(data, e.dst))
              .filter((k) => k.kind === 'directory' || k.kind === 'file')
              .sort(
                (a, b) =>
                  Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
                  a.name.localeCompare(b.name),
              )
              .map((k) => tree(k, d - 1))
          : undefined;
        return {
          id: n.id,
          name: n.name,
          path,
          type: dir ? 'dir' : 'file',
          language: languages.get(path) ?? null,
          tier: n.tier,
          role: roles.get(n.id) ?? null,
          flagCount: children
            ? children.reduce((a, k) => a + k.flagCount, 0)
            : (counts.get(n.id) ?? 0),
          featureIds: children
            ? [...new Set(children.flatMap((k) => k.featureIds))].slice(0, 3)
            : [...membersOf(n)],
          ...(children && d > 0 ? { children } : {}),
        };
      }
      return tree(root, depth);
    },
    listNodes(f) {
      return [...c().nodes.values()]
        .filter(
          (n) =>
            (!f.kinds || f.kinds.includes(n.kind)) &&
            (f.filePath === undefined || n.filePath === f.filePath) &&
            (!f.featureId || membersOf(n).has(f.featureId)),
        )
        .slice(0, f.limit ?? Infinity)
        .map(ref);
    },
    neighbours(id, o) {
      const data = c();
      need(data, id);
      return adjacent(data, id, o.direction, o.edgeKinds).map((s) => edgeRef(data, s.id, s.edge));
    },
    impact: (id, o) => impact(c(), id, o.direction, o.depth, o.edgeKinds),
    graph: (o) => graphView(c(), o),
    pathsBetween: (a, b, o) => paths(c(), a, b, o?.maxDepth, o?.maxPaths),
    find(q, opts = {}) {
      const key = q.toLowerCase().trim(),
        result: FindResultDTO[] = [];
      if (!key) return result;
      for (const n of c().nodes.values()) {
        if (opts.kinds && !opts.kinds.includes(n.kind)) continue;
        const name = n.name.toLowerCase(),
          ranges: [number, number][] = [],
          start = name.indexOf(key);
        let score = 0;
        if (start >= 0) {
          score = start === 0 ? 1 : 0.85;
          ranges.push([start, start + key.length]);
        } else {
          let at = -1;
          for (const char of key) {
            at = name.indexOf(char, at + 1);
            if (at < 0) {
              ranges.length = 0;
              break;
            }
            const last = ranges.at(-1);
            if (last?.[1] === at) last[1]++;
            else ranges.push([at, at + 1]);
          }
          score = ranges.length ? 0.65 : n.filePath?.toLowerCase().includes(key) ? 0.4 : 0;
        }
        if (score) result.push({ node: ref(n), score, matchRanges: ranges, context: n.filePath });
      }
      return result
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.node.name.length - b.node.name.length ||
            a.node.id.localeCompare(b.node.id),
        )
        .slice(0, opts.limit ?? 20);
    },
    search(q, opts = {}) {
      const terms = q.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 20);
      if (!terms?.length) return [];
      const expr = terms.map((t) => '"' + t + '"*').join(' AND ');
      const sql =
        "SELECT node_id id,name,path,summary,tags,snippet(search_fts,-1,'«','»','…',12) snippet,bm25(search_fts,0,0,8,5,4,3,1) rank FROM search_fts WHERE search_fts MATCH ?" +
        (opts.kind ? ' AND kind=?' : '') +
        ' ORDER BY rank LIMIT ?';
      return store
        .all<{
          id: string;
          name: string;
          path: string;
          summary: string;
          tags: string;
          snippet: string;
          rank: number;
        }>(sql, expr, ...(opts.kind ? [opts.kind] : []), opts.limit ?? 30)
        .flatMap((r) => {
          const n = c().nodes.get(r.id);
          if (!n) return [];
          const field =
            (['name', 'path', 'summary', 'tags'] as const).find((f) =>
              terms.some((t) => r[f]?.toLowerCase().includes(t.toLowerCase())),
            ) ?? 'code';
          return [
            {
              node: ref(n),
              score: Math.abs(r.rank) / (1 + Math.abs(r.rank)),
              field,
              snippet: r.snippet,
              purpose: r.summary || null,
            } satisfies SearchResultDTO,
          ];
        });
    },
    routes(f = {}) {
      return [...c().nodes.values()]
        .filter(
          (n) =>
            n.kind === 'route' &&
            (!f.method || ids.parse(n.id).method === f.method.toUpperCase()) &&
            (!f.pathPrefix || ids.parse(n.id).path?.startsWith(f.pathPrefix)),
        )
        .map(ref);
    },
    dataAccess(id) {
      return query
        .listNodes({ kinds: ['db_model'] })
        .filter((n) => !id || n.id === id)
        .map((model) => ({
          model,
          readers: query
            .neighbours(model.id, { direction: 'up', edgeKinds: ['reads'] })
            .map((e) => e.node),
          writers: query
            .neighbours(model.id, { direction: 'up', edgeKinds: ['writes'] })
            .map((e) => e.node),
        }));
    },
    getHealth: health,
    diffImpact: (spec) => diffImpact(source.root, query, spec.base),
  };
  return query;
}
