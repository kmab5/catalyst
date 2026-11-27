import { expect, test } from 'vitest';
import { PassThrough } from 'node:stream';
import { ids, sampleNodeRef, sampleRunDTO } from '@catalyst/shared';
import { createProgressRenderer } from './progress.js';
import { renderCitationsForTerminal } from './terminal-citations.js';

test('non-TTY progress prints each stage once', () => {
  const stream = new PassThrough();
  const p = createProgressRenderer({ stream, isTTY: false });
  for (const done of [0, 1, 2])
    p.update({
      runId: 'r',
      stage: 'parse',
      done,
      total: 2,
      message: done === 2 ? '1 parse error' : undefined,
    });
  p.finish(sampleRunDTO);
  expect(stream.read().toString()).toBe('[catalyst] parse 2/2 · 1 parse error\n');
});
test.each(['app/(demo)/[page]/page.tsx', 'app/docs/[[...slug]]/page.tsx'])('route citations in %s resolve to file:line', (path) => {
  const ref = { ...sampleNodeRef, id: ids.sym(path, 'Page'), filePath: path, startLine: 12 };
  const rendered = renderCitationsForTerminal('See [[' + ref.id + ']].', [ref]);
  expect(rendered).toContain('See ' + path + ':12.');
  expect(rendered).toContain('Sources');
});
