import { expect, test } from 'vitest';
import { ids } from '@/api/contract';
import { flowToGraph } from './flow-graph';

test('maps repeated steps to distinct nodes and labels verified and inferred hops', () => {
  const one = ids.file('a.ts'),
    two = ids.file('b.ts');
  const { nodes, edges } = flowToGraph({
    id: 'flow',
    name: 'A flow',
    trigger: 'Start',
    steps: [one, two, one].map((nodeId, i) => ({ nodeId, action: 'Read', edgeVerified: i !== 2 })),
  });
  expect(nodes.map((n) => n.id)).toEqual(['0', '1', '2']);
  expect(edges.map((e) => [e.source, e.target, e.verified])).toEqual([
    ['0', '1', true],
    ['1', '2', false],
  ]);
});
