import { z } from 'zod';

export const Ease = z.enum(['easy', 'moderate', 'hard']);
export type Ease = z.infer<typeof Ease>;

export const Changeability = z.object({
  addEase:    z.object({ level: Ease, reason: z.string() }),
  changeEase: z.object({ level: Ease, reason: z.string() }),
  removeEase: z.object({ level: Ease, reason: z.string() }),
  touchpoints: z.array(z.string()),
  risks: z.array(z.object({ text: z.string(), nodeIds: z.array(z.string()) })),
  couplings: z.array(z.object({ featureId: z.string(), edgeCount: z.number(), note: z.string() })),
  citesMetrics: z.array(z.object({ name: z.string(), value: z.union([z.number(), z.string()]), nodeId: z.string().optional() })),
  summary: z.string(),
});
export type Changeability = z.infer<typeof Changeability>;
