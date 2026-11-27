import type { Lang, Feature, ProgressEvent } from '@catalyst/shared';
import type { Db } from '../context.js';
import { Snapshot } from '../context.js';
import type { LLMClient } from '../client.js';
import { summarize, rollup, type StageContext } from './summarize.js';
import { discover, deterministicFeatures, saveFeatures } from './features.js';
import { changeabilityFacts, fallbackCard, grade } from './changeability.js';
import { overview } from './overview.js';
import { extractTier3 } from './tier3.js';
export function writeDeterministicFeatures(db: Db, lang: Lang = 'en') {
  const s = new Snapshot(db, lang),
    features = deterministicFeatures(s);
  for (const f of features) f.changeability = fallbackCard(changeabilityFacts(f, features, s), f, lang);
  saveFeatures(s, features, 'fallback');
  return features;
}
export const registerAiStages = () =>
  ['summarize', 'rollup', 'features', 'overview', 'changeability'] as const;
export async function runAiStages(options: {
  db: Db;
  root: string;
  client: LLMClient;
  lang: Lang;
  tier3?: boolean;
  signal?: AbortSignal;
  onProgress?: (stage: ProgressEvent['stage'], done: number, total: number, degraded?: boolean) => void;
}) {
  const { db, root, client, lang, signal, onProgress } = options;
  let s = new Snapshot(db, lang);
  const errors: string[] = [];
  let partial = false;
  let features: Feature[] = [];
  for (const stage of registerAiStages()) {
    signal?.throwIfAborted();
    let done = 0,
      failed = 0;
    const total =
      stage === 'summarize'
        ? s.files.length
        : stage === 'rollup'
          ? [...s.nodes.values()].filter((n) => n.kind === 'directory').length
          : stage === 'changeability'
            ? features.length
            : 1;
    onProgress?.(stage, 0, total);
    const context: StageContext = {
      s,
      root,
      client,
      attempt: async (item, fn) => {
        signal?.throwIfAborted();
        try {
          if (client.failureReason() || client.budgetExceeded()) {
            partial = true;
            failed++;
            return undefined;
          }
          return await fn();
        } catch {
          signal?.throwIfAborted();
          failed++;
          partial = true;
          // Provider errors can carry prompt bodies, source text or authorization headers.
          errors.push(
            stage +
              ' ' +
              item +
              ': ' +
              (client.failureReason() ??
                (client.budgetExceeded() ? 'Budget exceeded' : 'Item could not be generated')),
          );
          return undefined;
        } finally {
          done++;
          onProgress?.(stage, done, Math.max(total, done));
        }
      },
    };
    switch (stage) {
      case 'summarize':
        if (options.tier3 === true && s.files.some((f) => f.tier === 3)) {
          s = await extractTier3(context);
          context.s = s;
        }
        await summarize(context);
        break;
      case 'rollup':
        await rollup(context);
        break;
      case 'features':
        features = await discover(context);
        break;
      case 'overview':
        await overview(features, context);
        break;
      case 'changeability':
        await grade(features, context);
        break;
    }
    onProgress?.(stage, Math.max(total, done), Math.max(total, done), failed / Math.max(done, 1) > 0.3);
  }
  return {
    aiStatus: partial ? ('partial' as const) : ('done' as const),
    errors,
    usage: client.usage(),
    repairs: client.repairs,
  };
}
