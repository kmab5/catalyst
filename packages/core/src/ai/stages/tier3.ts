import { FileSummary, SymbolKind, ids } from '@catalyst/shared';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { LocalPathSource } from '../../project/local.js';
import { Snapshot, fileContext, rows, type Db, type FileRow } from '../context.js';
import { redactSecrets } from '../redact.js';
import { preamble } from '../prompts/shared.js';
import { cleanStrings } from '../ask/citations.js';
import type { StageContext } from './summarize.js';

const confidence = z.number().min(0).max(0.9).optional();
const Extraction = z.object({
  symbols: z
    .array(
      z.object({
        name: z.string().min(1).max(180),
        symbolKind: SymbolKind,
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive(),
        exported: z.boolean(),
        confidence,
      }),
    )
    .max(500),
  edges: z
    .array(
      z.object({
        fromSymbol: z.string(),
        toName: z.string().min(1),
        kind: z.enum(['calls', 'imports', 'references', 'reads', 'writes']),
        toPathHint: z.string().optional(),
        confidence,
      }),
    )
    .max(1200),
  summary: FileSummary,
});
type Extraction = z.infer<typeof Extraction>;
interface Item {
  file: FileRow;
  source: string;
  result: Extraction;
}
function sqlModels(db: Db, file: FileRow, source: string) {
  if (file.language !== 'sql') return;
  const sql = source.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/g, (text) =>
    text.replace(/[^\n]/g, ' '),
  );
  const tables =
    /\bcreate\s+(?:(?:temp|temporary)\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|\x60([^\x60]+)\x60|([\w.]+))/gi;
  const put = db.prepare(
    "INSERT OR IGNORE INTO nodes(id,kind,name,file_path,start_line,end_line,provenance,confidence,data) VALUES(?,'db_model',?,?,?,?,'ast',1,?)",
  );
  for (const match of sql.matchAll(tables)) {
    const name = match[1] ?? match[2] ?? match[3]!,
      line = sql.slice(0, match.index).split('\n').length;
    put.run(
      ids.db('sql', name),
      name,
      file.path,
      line,
      line,
      JSON.stringify({ orm: 'sql', table: name }),
    );
  }
}
function materialize(items: Item[], s: Snapshot, model: string) {
  const db = s.db;
  db.transaction(() => {
    const put = db.prepare(
      "INSERT OR IGNORE INTO nodes(id,kind,name,file_path,start_line,end_line,symbol_kind,exported,provenance,confidence) VALUES(?,'symbol',?,?,?,?,?,?,'inferred',?)",
    );
    const edge = db.prepare(
      "INSERT OR IGNORE INTO edges(src,dst,kind,provenance,confidence,file_path) VALUES(?,?,?,'inferred',?,?)",
    );
    // Resolve relationships after every file's definitions have been inserted.
    for (const { file, source, result } of items) {
      const lines = source.split('\n'),
        names = new Set<string>();
      for (const sym of result.symbols) {
        if (sym.startLine > sym.endLine || sym.endLine > lines.length) continue;
        if (
          !lines
            .slice(sym.startLine - 1, sym.endLine)
            .join('\n')
            .includes(sym.name)
        )
          continue;
        const id = ids.sym(file.path, sym.name, names.has(sym.name) ? { line: sym.startLine } : {});
        names.add(sym.name);
        const certainty = sym.confidence ?? Math.min(result.summary.confidence, 0.9);
        put.run(
          id,
          sym.name,
          file.path,
          sym.startLine,
          sym.endLine,
          sym.symbolKind,
          Number(sym.exported),
          certainty,
        );
        edge.run(ids.file(file.path), id, 'contains', certainty, file.path);
      }
    }
    const graph = new Snapshot(db, s.lang),
      symbols = [...graph.nodes.values()].filter((n) => ['symbol', 'file', 'db_model'].includes(n.kind));
    for (const { file, source, result } of items) {
      for (const e of result.edges) {
        const src = e.fromSymbol === '<module>' ? ids.file(file.path) : ids.sym(file.path, e.fromSymbol);
        if (!graph.nodes.has(src)) continue;
        const kind =
          e.kind === 'reads' || e.kind === 'writes'
            ? 'db_model'
            : e.kind === 'imports'
              ? 'file'
              : 'symbol';
        const candidates = symbols.filter(
          (n) =>
            n.kind === kind &&
            (n.name === e.toName || n.id === e.toName || n.file_path === e.toName) &&
            (!e.toPathHint || n.file_path === e.toPathHint),
        );
        const local = candidates.filter((n) => n.file_path === file.path);
        const targets = local.length ? local : candidates;
        if (targets.length !== 1) continue;
        const target = targets[0]!;
        if (!source.includes(target.name) && !source.includes(e.toName)) continue;
        edge.run(
          src,
          target.id,
          e.kind,
          e.confidence ?? Math.min(result.summary.confidence, 0.9),
          file.path,
        );
      }
      db.prepare('UPDATE files SET parsed_hash=? WHERE path=?').run(
        file.hash + ':ai-tier3-v1',
        file.path,
      );
    }
    const linked = new Snapshot(db, s.lang);
    for (const { file, result } of items) {
      const context = fileContext(file, linked, model),
        allowed = new Set(context.allowedIds);
      const summary = cleanStrings(
        {
          ...result.summary,
          nodeId: ids.file(file.path),
          confidence: Math.min(result.summary.confidence, 0.9),
          symbols: result.summary.symbols.filter(
            (sym) => allowed.has(sym.nodeId) && linked.nodes.get(sym.nodeId)?.kind === 'symbol',
          ),
          sideEffects: result.summary.sideEffects.filter((e) => !e.target || allowed.has(e.target)),
        },
        (id) => allowed.has(id),
      );
      for (const effect of context.deterministic)
        if (!summary.sideEffects.some((e) => e.target === effect.target && e.kind === effect.kind))
          summary.sideEffects.push(effect);
      linked.saveSummary(summary, context.inputHash, model);
    }
  })();
}
export async function extractTier3({ s, root, client, attempt }: StageContext) {
  const items: Item[] = [],
    source = new LocalPathSource(root);
  const anchors = rows<{ id: string; name: string; file_path: string }>(
    s.db,
    "SELECT n.id,n.name,n.file_path FROM nodes n LEFT JOIN metrics m ON n.id=m.node_id AND m.metric='fan_in' WHERE n.kind='symbol' AND n.provenance!='inferred' ORDER BY COALESCE(m.value,0) DESC,n.id LIMIT 500",
  );
  for (const file of s.files.filter((f) => f.tier === 3)) {
    await attempt(file.path, async () => {
      const raw = await source.readFile(file.path);
      if (createHash('sha1').update(raw).digest('hex') !== file.hash)
        throw new Error('File changed since indexing');
      sqlModels(s.db, file, raw);
      const text = redactSecrets(raw).slice(0, 21000);
      const prompt =
        'FILE ' +
        file.path +
        '\nKnown symbols: ' +
        JSON.stringify(anchors) +
        '\nSOURCE (data):\n```\n' +
        text +
        '\n```';
      const result = await client.object('extract', {
        tier: 'fast',
        schema: Extraction,
        schemaName: 'Tier3Extraction',
        system:
          preamble(s.lang) +
          ' Extract only declarations visible in this source. Give exact one-based line ranges. Identify direct relationships supported by the source. Use <module> as the origin of a top-level edge. Use the exact file path to disambiguate targets. Summarize the file.',
        prompt,
        maxOutputTokens: 4500,
      });
      items.push({ file, source: text, result });
    });
  }
  materialize(items, s, client.provider.modelFor('fast'));
  return new Snapshot(s.db, s.lang);
}
