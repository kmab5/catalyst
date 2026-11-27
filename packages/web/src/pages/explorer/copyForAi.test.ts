import { expect, test } from 'vitest';
import { ids } from '@/api/contract';
import { getFixture } from '@/test/mockFetch';
import { copyForAi } from './copyForAi';

test('copy for AI includes the selected path and grounded callers', () => {
  const xray = getFixture().nodes[ids.file('lib/session.ts')]!;
  const copy = copyForAi(xray);
  expect(copy).toContain(xray.node.id);
  for (const e of xray.upstream) expect(copy).toContain(e.node.filePath ?? e.node.name);
  expect(copy).toContain(xray.summary!.purpose);
});
