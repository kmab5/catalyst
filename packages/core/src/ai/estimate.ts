import { ids, type EstimateDTO, type Lang } from '@catalyst/shared';
import { Snapshot, dependencyGroups, fileContext, testFile, type Db } from './context.js';
import { price } from './pricing.js';
import type { LLMProvider } from './providers/types.js';
export function estimate(db: Db, lang: Lang = 'en', provider?: LLMProvider): EstimateDTO {
  const s = new Snapshot(db, lang),
    model = { fast: provider?.modelFor('fast') ?? '', smart: provider?.modelFor('smart') ?? '' };
  let filesNeedingSummary = 0,
    cachedSummaries = 0,
    fastIn = 0;
  for (const group of dependencyGroups(s)) {
    const cycle = new Set(group.map((f) => ids.file(f.path)));
    for (const f of group) {
      if (f.loc < 3 || testFile(f.path)) continue;
      const id = ids.file(f.path),
        cached = s.summaries.get(id);
      if (cached && cached.inputHash === fileContext(f, s, model.fast, cycle).inputHash) {
        cachedSummaries++;
        continue;
      }
      filesNeedingSummary++;
      fastIn += Math.min(6000, Math.ceil(f.size_bytes / 3.5)) + 2600;
    }
  }
  const changed = filesNeedingSummary > 0;
  const dirs = changed
    ? [...s.nodes.values()].filter(
        (n) =>
          n.kind === 'directory' &&
          s.files.filter((f) => f.path.startsWith(n.id.slice(4) + '/')).length >= 2,
      ).length
    : 0;
  const batches = changed ? Math.ceil(s.files.length / 400) : 0;
  const featureCount = changed
    ? Math.max(
        1,
        (
          db.prepare('SELECT COUNT(*) AS count FROM features WHERE language=?').get(lang) as {
            count: number;
          }
        ).count,
      )
    : 0;
  const smartIn = batches * 24000 + (batches > 1 ? 6000 : 0) + (changed ? 8000 : 0) + featureCount * 4000;
  const smartOut = batches * 6000 + (changed ? 1500 : 0) + featureCount * 600,
    fastOut = filesNeedingSummary * 450 + dirs * 250;
  fastIn += dirs * 1500;
  const fastPrice = price(model.fast, fastIn, fastOut),
    smartPrice = price(model.smart, smartIn, smartOut);
  return {
    files: s.files.length,
    filesNeedingSummary,
    cachedSummaries,
    llmCalls:
      filesNeedingSummary + dirs + batches + (batches > 1 ? 1 : 0) + (changed ? 1 : 0) + featureCount,
    tokens: { in: fastIn + smartIn, out: fastOut + smartOut },
    costUsd:
      provider?.local || provider?.id === 'claude-code' || fastPrice === null || smartPrice === null
        ? null
        : fastPrice + smartPrice,
    model,
    note:
      provider?.id === 'claude-code'
        ? 'Billed to your Claude plan'
        : provider?.local
          ? 'Local inference'
          : !provider
            ? 'No configured provider'
            : 'Approximate token and cost estimate',
  };
}
