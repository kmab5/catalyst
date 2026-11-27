import { expect, test } from 'vitest';
import { ids } from '@catalyst/shared';
import { getFixture } from '@/test/mockFetch';
import { toElements } from './elements';
import { impactClasses } from './impactClasses';

const fixture = getFixture();
test('compound parents are present and edge provenance is preserved', () => {
  const graph = fixture.graph.file;
  const firstEdge = graph.edges[0]!;
  const elements = toElements({ ...graph, edges: [{ ...firstEdge, provenance: 'heuristic' }] }, {});
  const ids = new Set(elements.map((e) => e.data.id));
  expect(elements.some((e) => e.data.parent)).toBe(true);
  for (const e of elements) if (e.data.parent) expect(ids.has(e.data.parent)).toBe(true);
  expect(elements.find((e) => e.group === 'edges')?.classes).toContain('heuristic');
});
test('file grouping materializes missing directory parents from the real server', () => {
  const element = {
    id: ids.file('lib/a.ts'),
    label: 'a.ts',
    parent: ids.dir('lib'),
    featureId: null,
    size: 5,
    flags: 0,
    kind: 'file' as const,
  };
  const elements = toElements(
    { level: 'file', nodes: [element], edges: [], truncated: false, totalNodes: 1 },
    {},
    'folder',
  );
  expect(elements.find((e) => e.data.id === element.parent)).toBeDefined();
});
test('impact marks the root and separates each direction', () => {
  const root = ids.file('lib/session.ts');
  const classes = impactClasses(fixture.impact[root]!);
  expect(classes.get(root)).toBe('root');
  expect([...classes.values()]).toContain('up');
});
