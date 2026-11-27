import { z } from 'zod';

export const Lang = z.enum(['en', 'tr']);
export type Lang = z.infer<typeof Lang>;

export const NodeKind = z.enum(['directory','file','symbol','route','db_model','env_var','package','service','feature']);
export type NodeKind = z.infer<typeof NodeKind>;

export const SymbolKind = z.enum(['function','class','method','variable','type','interface','enum','component','hook']);
export type SymbolKind = z.infer<typeof SymbolKind>;

export const EdgeKind = z.enum(['contains','imports','calls','references','renders','extends','implements','handles',
  'reads','writes','uses_env','calls_service','depends_on','member_of','feature_depends']);
export type EdgeKind = z.infer<typeof EdgeKind>;

export const Provenance = z.enum(['ast','resolved','heuristic','inferred']);
export type Provenance = z.infer<typeof Provenance>;

export const Severity = z.enum(['info','warn','high']);
export type Severity = z.infer<typeof Severity>;

export const NodeRef = z.object({ id: z.string(), kind: NodeKind, name: z.string(), filePath: z.string().nullable(),
  startLine: z.number().nullable(), provenance: Provenance });
export type NodeRef = z.infer<typeof NodeRef>;

export const NodeDTO = NodeRef.extend({
  endLine: z.number().nullable(),
  symbolKind: z.string().nullable(),
  exported: z.boolean(),
  signature: z.string().nullable(),
  confidence: z.number(),
  tier: z.number().nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  metrics: z.record(z.string(), z.number()),
});
export type NodeDTO = z.infer<typeof NodeDTO>;

export const EdgeRefDTO = z.object({
  kind: EdgeKind, provenance: Provenance, confidence: z.number(),
  node: NodeRef,
  line: z.number().nullable(),
  filePath: z.string().nullable(),
});
export type EdgeRefDTO = z.infer<typeof EdgeRefDTO>;

export const FlagDTO = z.object({
  id: z.string(), rule: z.string(), severity: Severity,
  node: NodeRef, title: z.string(), explanation: z.string().nullable(),
  evidence: z.object({ metrics: z.record(z.string(), z.number()).optional(),
    nodeIds: z.array(z.string()).optional(), cycle: z.array(z.string()).optional() }),
});
export type FlagDTO = z.infer<typeof FlagDTO>;

export const GraphDTO = z.object({
  level: z.enum(['feature','module','file','symbol']),
  nodes: z.array(z.object({ id: z.string(), label: z.string(), kind: NodeKind, parent: z.string().nullable(),
    featureId: z.string().nullable(), size: z.number(), flags: z.number() })),
  edges: z.array(z.object({ source: z.string(), target: z.string(), kind: EdgeKind, weight: z.number(), provenance: Provenance })),
});
export type GraphDTO = z.infer<typeof GraphDTO>;
