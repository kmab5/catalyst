import type { Flow } from '@/api/contract';

/** Flow steps are occurrences. A node can occur more than once in one flow. */
export function flowToGraph(flow: Flow) {
  const nodes = flow.steps.map((step, index) => ({ id: String(index), step, index }));
  const edges = nodes.slice(1).map(({ id, index, step }) => ({
    id: `hop-${index}`,
    source: String(index - 1),
    target: id,
    verified: step.edgeVerified,
  }));
  return { nodes, edges };
}
