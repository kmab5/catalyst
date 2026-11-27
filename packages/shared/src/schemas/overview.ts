import { z } from 'zod';

export const AppOverview = z.object({
  name: z.string(),
  oneLiner: z.string(),
  description: z.string(),
  audience: z.string(),
  stack: z.array(z.object({ name: z.string(), category: z.string(), evidence: z.array(z.string()) })),
  architecture: z.string(),
  featureIds: z.array(z.string()),
  entryPoints: z.array(z.string()),
  gaps: z.array(z.string()),
});
export type AppOverview = z.infer<typeof AppOverview>;
