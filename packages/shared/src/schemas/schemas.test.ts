import { expect, test } from 'vitest';
import { z } from 'zod';
import * as contract from '../index.js';
import * as samples from '../samples.js';

for (const [name, schema] of Object.entries(contract)) {
  if (schema instanceof z.ZodType) {
    test(name + ' parses its sample', () => {
      const key = ('sample' + name) as keyof typeof samples;
      expect(schema.parse(samples[key])).toEqual(samples[key]);
    });
  }
}

test('unknown Ask events fail validation', () => {
  expect(contract.AskEvent.safeParse({ type: 'nope' }).success).toBe(false);
});
test('cancelled progress can report degraded output', () => {
  expect(contract.ProgressEvent.parse({ runId: 'r', stage: 'cancelled', done: 0, total: 0, degraded: true }).stage).toBe('cancelled');
});
test('Claude Code binary defaults to claude', () => {
  expect(contract.ProviderConfig.parse({ type: 'claude-code' })).toEqual({ type: 'claude-code', binary: 'claude' });
});
test('default index and graph requests', () => {
  expect(contract.IndexRequest.parse({})).toEqual({ mode: 'incremental', ai: true });
  expect(contract.GraphQuery.parse({})).toEqual({ level: 'file', depth: 2, limit: 400 });
});
