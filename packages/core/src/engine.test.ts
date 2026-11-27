import { test, expect } from 'vitest';
import { createEngine } from './engine.js';

test('engine contract is available before indexing is implemented', () => {
  const engine = createEngine();
  expect(() => engine.projects.list()).toThrowError(expect.objectContaining({ code: 'NOT_IMPLEMENTED' }));
});
