import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HealthResponse, ProjectDTO, RunDTO, OverviewDTO, FeatureListItemDTO, TreeNodeDTO, XRayDTO, SourceDTO,
  ImpactDTO, GraphResponse, FindResultDTO, SearchResultDTO, HealthDTO } from '../packages/shared/src/index.js';

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node --import tsx scripts/validate-dtos.ts <response-directory>');
const schemas = {
  run: RunDTO, ready: HealthResponse, projects: ProjectDTO.array(), project: ProjectDTO, overview: OverviewDTO,
  features: FeatureListItemDTO.array(), tree: TreeNodeDTO, xray: XRayDTO, source: SourceDTO, impact: ImpactDTO,
  graph: GraphResponse, find: FindResultDTO.array(), search: SearchResultDTO.array(), health: HealthDTO,
};
function read(name: string): unknown {
  return JSON.parse(readFileSync(join(dir, name + '.json'), 'utf8'));
}
for (const [name, schema] of Object.entries(schemas)) {
  const result = schema.safeParse(read(name));
  if (!result.success) throw new Error(name + '.json: ' + result.error.message);
}
const project = ProjectDTO.parse(read('project'));
if (!project.stats || project.stats.files < 1 || project.stats.edges < 1) throw new Error('Expected indexed files and edges');
if (RunDTO.parse(read('run')).status !== 'done') throw new Error('Index did not finish');
if (HealthResponse.parse(read('ready')).mock) throw new Error('Expected live API');
console.log('ALL VALID');
