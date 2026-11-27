import { z } from 'zod';
import { NodeRef } from './graph.js';
import { Changeability } from './changeability.js';

export const FeatureMember = z.object({
  nodeId: z.string(),
  role: z.enum(['entry','core','support','data','ui','config','test']),
  reason: z.string().optional(),
});
export type FeatureMember = z.infer<typeof FeatureMember>;

export const FlowStep = z.object({
  nodeId: z.string(),
  action: z.string(),
  edgeVerified: z.boolean(),
  confidence: z.number().optional(),
});
export type FlowStep = z.infer<typeof FlowStep>;

export const Flow = z.object({
  id: z.string(),
  name: z.string(),
  trigger: z.string(),
  steps: z.array(FlowStep).min(2),
});
export type Flow = z.infer<typeof Flow>;

export const Feature = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['auth','data','payments','ui','api','content','notifications','integration','admin','infra','analytics','core','other']),
  summary: z.string(),
  description: z.string(),
  entryPoints: z.array(z.string()),
  members: z.array(FeatureMember),
  flows: z.array(Flow),
  dependsOn: z.array(z.string()),
  services: z.array(z.string()),
  dataModels: z.array(z.string()),
  changeability: Changeability.optional(),
  confidence: z.number(),
});
export type Feature = z.infer<typeof Feature>;

export const FeatureDetailDTO = Feature.extend({ members: z.array(FeatureMember.extend({ node: NodeRef })) });
export type FeatureDetailDTO = z.infer<typeof FeatureDetailDTO>;
