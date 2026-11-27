import { setImmediate as yieldToLoop } from 'node:timers/promises';
import { posix } from 'node:path';
import { ids, type NodeDTO, type FlagDTO } from '@catalyst/shared';
import { scan, type ScanOptions, type SourceFile } from './scan/scanner.js';
import { loadGrammars } from './parse/grammars.js';
import { tsAdapter, ADAPTER_VERSION } from './parse/ts-adapter.js';
import { pyAdapter } from './parse/py-adapter.js';
import { goAdapter } from './parse/go-adapter.js';
import type { ParsedFile } from './parse/types.js';
import { link } from './resolve/link.js';
import { detect } from './detect/index.js';
import { Model, type AnalysisEdge } from './graph/model.js';
import { metrics } from './analyze/metrics.js';
import { health, type HealthOptions } from './analyze/health.js';
export type StructuralStage = 'scan' | 'parse' | 'resolve' | 'detect' | 'graph' | 'health';
export interface AnalysisOptions extends ScanOptions {
  grammarsDir?: string;
  health?: HealthOptions;
  detectors?: Record<string, boolean>;
  previous?: {
    files: Pick<SourceFile, 'path' | 'hash' | 'parseError' | 'parsedHash'>[];
    parsed: Record<string, ParsedFile>;
  };
  onProgress?: (stage: StructuralStage, done: number, total: number, message?: string) => void;
  onParseError?: (path:string)=>void;
}
export interface AnalysisResult {
  files: SourceFile[];
  nodes: NodeDTO[];
  edges: AnalysisEdge[];
  flags: FlagDTO[];
  changed: string[];
  deleted: string[];
  stack: { name: string; category: string; evidence: string[] }[];
  parsed: Record<string, ParsedFile>;
}
export async function analyze(root: string, opts: AnalysisOptions = {}): Promise<AnalysisResult> {
  const stage = async (name: StructuralStage, done: number, total: number,message?:string) => {
    opts.signal?.throwIfAborted();
    opts.onProgress?.(name, done, total,message);
    await yieldToLoop();
    opts.signal?.throwIfAborted();
  };
  await stage('scan', 0, 0);
  const files = await scan(root, opts, (d, t) => opts.onProgress?.('scan', d, t));
  const paths = new Set(files.map((f) => f.path)),
    prior = new Map(opts.previous?.files.map((f) => [f.path, f]));
  const deleted = [...prior.keys()].filter((path) => !paths.has(path));
  const changed = files.filter((f) => prior.get(f.path)?.hash !== f.hash).map((f) => f.path);
  const model = new Model(),
    parsed: Record<string, ParsedFile> = Object.create(null);
  model.node(ids.dir(''), posix.basename(root.replace(/\\/g, '/')) || '.');
  for (const f of files) {
    if (f.parseError === 'binary') continue;
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const id = ids.dir(parts.slice(0, i).join('/'));
      if (!model.nodes.has(id)) {
        model.node(id, parts[i - 1]!);
        model.edge(ids.dir(parts.slice(0, i - 1).join('/')), id, 'contains');
      }
    }
    const id = ids.file(f.path);
    model.node(id, parts.at(-1)!, {
      filePath: f.path,
      tier: f.tier,
      metrics: { loc: f.loc },
      data: {
        language: f.language,
        isTest:
          /(?:^|\/)(?:__tests__|tests?)\/|\.(?:test|spec)\.|(?:^|\/)test_[^/]+\.py$|_test\.(?:py|go)$/.test(
            f.path,
          ),
      },
    });
    model.edge(ids.dir(parts.slice(0, -1).join('/')), id, 'contains', f.path);
  }
  const toParse = files.filter(
    (f) => (f.language === 'go' && f.tier === 2) || (f.tier === 1 && f.language !== 'prisma'),
  );
  const queue = toParse.filter((f) => {
    const cached = opts.previous?.parsed[f.path],
      previous = prior.get(f.path);
    if (!cached || !previous || previous.parseError || previous.parsedHash !== f.hash + ':' + ADAPTER_VERSION)
      return true;
    parsed[f.path] = cached;
    f.parsedHash = f.hash + ':' + ADAPTER_VERSION;
    f.parseError = previous.parseError;
    return false;
  });
  await stage('parse', 0, queue.length);
  if (queue.length) {
    const grammars = await loadGrammars(opts.grammarsDir);
    let last = Date.now(), errors=0;
    for (const [i, f] of queue.entries()) {
      opts.signal?.throwIfAborted();
      const parser = await grammars.parser(f.language).catch((error) => {
        if (f.language !== 'go') throw error;
        f.tier = opts.tier3 ? 3 : 0;
        f.parseError = 'grammar_unavailable';
        model.node(ids.file(f.path), posix.basename(f.path), { tier: f.tier });
        return null;
      });
      try {
        if (parser) {
          const adapter = f.language === 'go' ? goAdapter : f.language === 'python' ? pyAdapter : tsAdapter;
          const p = adapter.parse({ parser, path: f.path, source: f.source });
          parsed[f.path] = p;
          f.parseError = p.partial ? 'partial' : null;
          f.parsedHash = f.hash + ':' + ADAPTER_VERSION;
        }
      } catch {
        f.parseError = 'parse_failed';
      }
      if(f.parseError){errors++;opts.onParseError?.(f.path);}
      if ((i + 1) % 25 === 0 || i + 1 === queue.length || Date.now() - last >= 250) {
        await stage('parse', i + 1, queue.length,errors?`${errors} parse error${errors===1?'':'s'}`:undefined);
        last = Date.now();
      }
    }
  }
  for (const p of Object.values(parsed))
    model.node(ids.file(p.path), posix.basename(p.path), {
      data: { client: p.directives.includes('use client') },
    });
  await stage('resolve', 0, files.length);
  const linked = link(model, files, parsed);
  opts.onProgress?.('resolve', files.length, files.length, linked.unresolved.length + ' unresolved imports');
  await stage('detect', 0, files.length);
  const stack = detect(model, files, parsed, linked, opts.detectors);
  opts.onProgress?.('detect', files.length, files.length);
  await stage('graph', 0, model.nodes.size);
  const graph = metrics(model);
  opts.onProgress?.('graph', model.nodes.size, model.nodes.size);
  await stage('health', 0, model.nodes.size);
  const flags = health(model, graph, files, parsed, linked, opts.health);
  opts.onProgress?.('health', model.nodes.size, model.nodes.size);
  return {
    nodes: [...model.nodes.values()],
    edges: [...model.edges.values()],
    flags,
    files,
    parsed,
    changed,
    deleted,
    stack,
  };
}
