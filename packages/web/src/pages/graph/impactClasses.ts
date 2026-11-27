import type { ImpactDTO } from '@/api/contract';

export function impactClasses(impact: ImpactDTO): Map<string, 'root' | 'up' | 'down'> {
  const classes = new Map<string, 'root' | 'up' | 'down'>();
  for (const node of impact.nodes) if (!classes.has(node.id)) classes.set(node.id, node.direction);
  classes.set(impact.root, 'root');
  return classes;
}
