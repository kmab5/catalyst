import { z } from 'zod';

export const SideEffect = z.object({
  kind: z.enum(['db_read','db_write','network','filesystem','env','state','auth','email','payment','log','other']),
  description: z.string(),
  target: z.string().optional(),
});
export type SideEffect = z.infer<typeof SideEffect>;

export const FileSummary = z.object({
  nodeId: z.string(),
  purpose: z.string(),
  details: z.string(),
  role: z.enum(['page','layout','ui_component','api_handler','server_action','middleware','service','data_access',
                'model','schema','auth','config','util','hook','types','test','script','styles','other']),
  positionInApp: z.string(),
  sideEffects: z.array(SideEffect),
  tags: z.array(z.string()).max(12),
  symbols: z.array(z.object({ nodeId: z.string(), purpose: z.string() })),
  featureHints: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});
export type FileSummary = z.infer<typeof FileSummary>;

export const ModuleSummary = z.object({
  nodeId: z.string(), purpose: z.string(), details: z.string(),
  keyFiles: z.array(z.string()), tags: z.array(z.string()),
});
export type ModuleSummary = z.infer<typeof ModuleSummary>;
