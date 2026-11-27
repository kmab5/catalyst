import { FileSummary, ModuleSummary, ids } from '@catalyst/shared';
import {
  assembleFileContext,
  dependencyGroups,
  fileContext,
  testFile,
  type Snapshot,
} from '../context.js';
import { cleanStrings } from '../ask/citations.js';
import { hash, type LLMClient } from '../client.js';
import { preamble } from '../prompts/shared.js';
import { PROMPT_VERSION } from '../defaults.js';
export interface StageContext {
  s: Snapshot;
  client: LLMClient;
  root: string;
  attempt: <T>(item: string, fn: () => Promise<T>) => Promise<T | undefined>;
}
export async function summarize({ s, client, root, attempt }: StageContext) {
  const model = client.provider.modelFor('fast');
  for (const group of dependencyGroups(s)) {
    const cycle = new Set(group.map((f) => ids.file(f.path)));
    await Promise.all(
      group.map((file) =>
        attempt(file.path, async () => {
          const id = ids.file(file.path),
            context = fileContext(file, s, model, cycle);
          if (s.summaries.get(id)?.inputHash === context.inputHash) return;
          const full = await assembleFileContext(file, s, model, root, cycle);
          const isTest = testFile(file.path);
          let summary: FileSummary;
          if (isTest || file.loc < 3 || full.isBarrel) {
            const description =
              s.lang === 'tr'
                ? isTest
                  ? 'Test dosyası'
                  : full.isBarrel
                    ? 'Yeniden dışa aktarım'
                    : 'Kısa kaynak dosyası'
                : isTest
                  ? 'Tests'
                  : full.isBarrel
                    ? 'Re-exports'
                    : 'Short source file';
            const purpose = description + ' · ' + file.path;
            summary = {
              nodeId: id,
              purpose,
              details: purpose,
              role: isTest ? 'test' : 'other',
              positionInApp: '',
              sideEffects: [],
              tags: isTest ? ['test'] : [],
              symbols: [],
              featureHints: [],
              confidence: 1,
            };
          } else {
            summary = await client.object('summarize', {
              tier: 'fast',
              schema: FileSummary,
              schemaName: 'FileSummary',
              system:
                preamble(s.lang) +
                ' Explain the file purpose, position in the app, key symbols and effects.',
              prompt: full.prompt,
            });
          }
          const allowed = new Set(context.allowedIds);
          summary = cleanStrings(
            {
              ...summary,
              nodeId: id,
              symbols: summary.symbols.filter(
                (n) => allowed.has(n.nodeId) && s.nodes.get(n.nodeId)?.kind === 'symbol',
              ),
              sideEffects: summary.sideEffects.filter((e) => !e.target || allowed.has(e.target)),
            },
            (id) => allowed.has(id),
          );
          for (const edge of context.deterministic)
            if (!summary.sideEffects.some((e) => e.kind === edge.kind && e.target === edge.target))
              summary.sideEffects.push(edge);
          s.saveSummary(summary, context.inputHash, model);
        }),
      ),
    );
  }
}
export async function rollup({ s, client, attempt }: StageContext) {
  const dirs = [...s.nodes.values()]
    .filter((n) => n.kind === 'directory')
    .sort((a, b) => b.id.split('/').length - a.id.split('/').length || b.id.length - a.id.length);
  for (const dir of dirs)
    await attempt(dir.id, async () => {
      const prefix = dir.id.slice(4).replace(/^\.$/, '');
      if (s.files.filter((f) => !prefix || f.path.startsWith(prefix + '/')).length < 2) return;
      const ids = (s.out.get(dir.id) ?? [])
        .filter((e) => e.kind === 'contains' && s.summaries.has(e.dst))
        .map((e) => e.dst)
        .sort((a, b) => (s.metrics.get(b)?.fan_in ?? 0) - (s.metrics.get(a)?.fan_in ?? 0));
      if (!ids.length) return;
      const model = client.provider.modelFor('fast'),
        inputHash = hash(
          ids.map((id) => [id, s.summaries.get(id)!.inputHash]),
          model,
          s.lang,
          PROMPT_VERSION.rollup,
        );
      if (s.summaries.get(dir.id)?.inputHash === inputHash) return;
      const children = ids.slice(0, 60).map((id) => {
        const v = s.summaries.get(id)!.value;
        return { id, purpose: v.purpose, tags: v.tags };
      });
      const allowed = new Set(children.map((c) => c.id));
      const result = await client.object('rollup', {
        schema: ModuleSummary,
        schemaName: 'ModuleSummary',
        tier: 'fast',
        system: preamble(s.lang) + ' Explain what this directory is responsible for.',
        prompt: JSON.stringify({ directory: dir.id, children }),
      });
      s.saveSummary(
        cleanStrings(
          { ...result, nodeId: dir.id, keyFiles: result.keyFiles.filter((id) => allowed.has(id)) },
          (id) => allowed.has(id),
        ),
        inputHash,
        model,
      );
    });
}
