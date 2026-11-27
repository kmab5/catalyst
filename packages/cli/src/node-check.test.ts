import { expect, test } from 'vitest';
import { checkNode } from './node-check.js';

test('Node 22+ can start; older versions show the upgrade instruction', () => {
  expect(checkNode('v22.0.0')).toEqual({ ok: true });
  expect(checkNode('18.19.0')).toMatchObject({
    ok: false,
    message: expect.stringContaining('v18.19.0'),
  });
});
