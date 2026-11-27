import type { ProjectDTO, Lang, OverviewDTO, FeatureListItemDTO, FeatureDetailDTO, NodeDTO, XRayDTO, SourceDTO, TreeNodeDTO, NodeKind, NodeRef, EdgeKind, EdgeRefDTO, ImpactDTO, GraphQuery, GraphDTO, FindResultDTO, SearchResultDTO, Severity, HealthDTO, FlagDTO, DiffImpactDTO } from '@catalyst/shared';

export interface QueryApi {
  getProject(): ProjectDTO;
  getOverview(lang: Lang): OverviewDTO;
  getStack(): OverviewDTO['stack'];
  listFeatures(lang: Lang): FeatureListItemDTO[];
  getFeature(featureId: string, lang: Lang): FeatureDetailDTO;
  featuresOf(nodeId: string): { id: string; name: string; role: string }[];
  getNode(nodeId: string): NodeDTO;
  getXRay(nodeId: string, lang: Lang): XRayDTO;
  getSource(nodeId: string, range?: { start: number; end: number }): Promise<SourceDTO>;
  getTree(rootPath?: string, depth?: number): TreeNodeDTO;
  listNodes(filter: { kinds?: NodeKind[]; filePath?: string; featureId?: string; limit?: number }): NodeRef[];
  neighbours(nodeId: string, opts: { direction: 'up' | 'down' | 'both'; edgeKinds?: EdgeKind[] }): EdgeRefDTO[];
  impact(nodeId: string, opts: { direction: 'up' | 'down' | 'both'; depth: number; edgeKinds?: EdgeKind[] }): ImpactDTO;
  graph(opts: GraphQuery): GraphDTO & { truncated: boolean; totalNodes: number };
  pathsBetween(fromId: string, toId: string, opts?: { maxDepth?: number; maxPaths?: number }): string[][];
  find(q: string, opts?: { kinds?: NodeKind[]; limit?: number }): FindResultDTO[];
  search(q: string, opts?: { kind?: NodeKind; limit?: number }): SearchResultDTO[];
  routes(filter?: { method?: string; pathPrefix?: string }): NodeRef[];
  dataAccess(modelId?: string): { model: NodeRef; readers: NodeRef[]; writers: NodeRef[] }[];
  getHealth(filter?: { severity?: Severity; rule?: string; featureId?: string }): HealthDTO;
  flagsFor(nodeId: string): FlagDTO[];
  diffImpact(spec: { base?: string }): Promise<Omit<DiffImpactDTO, 'narrative'>>;
}
