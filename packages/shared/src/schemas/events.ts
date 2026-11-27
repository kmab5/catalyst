import { z } from 'zod';
import { NodeRef } from './graph.js';

export const AskAnswer = z.object({
  markdown: z.string(),
  found: z.boolean(),
  citations: z.array(NodeRef),
  searched: z.array(z.string()),
});
export type AskAnswer = z.infer<typeof AskAnswer>;

export const AskEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thinking'), text: z.string() }),
  z.object({ type: z.literal('tool'), name: z.string(), args: z.unknown(), resultSummary: z.string() }),
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('done'), answer: AskAnswer }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type AskEvent = z.infer<typeof AskEvent>;

export const ProgressEvent = z.object({
  runId: z.string(),
  stage: z.enum(['scan','parse','resolve','detect','graph','health','summarize','rollup','features','overview','changeability','fts','done','error','cancelled']),
  done: z.number(), total: z.number(), message: z.string().optional(),
  tokens: z.object({ in: z.number(), out: z.number() }).optional(),
  degraded: z.boolean().optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;
