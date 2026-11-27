import { expect, test } from 'vitest';
import { PassThrough } from 'node:stream';
import { ids, sampleNodeRef, sampleRunDTO } from '@catalyst/shared';
import { createProgressRenderer } from './progress.js';
import { renderCitationsForTerminal } from './terminal-citations.js';

test('non-TTY progress prints each stage once', () => {
  const stream = new PassThrough();
  const p = createProgressRenderer({ stream, isTTY: false });
  for (const done of [0, 1, 2]) p.update({ runId: 'r', stage: 'parse', done, total: 2 });
  p.finish(sampleRunDTO);
  expect(
    stream
      .read()
      .toString()
      .match(/\[catalyst\] parse/g),
  ).toHaveLength(1);
});
test('route groups and dynamic route citations resolve to file:line', () => {
  const path = 'app/(demo)/[page]/page.tsx';
  const ref = { ...sampleNodeRef, id: ids.sym(path, 'Page'), filePath: path, startLine: 12 };
  const rendered = renderCitationsForTerminal('See [[' + ref.id + ']].', [ref]);
  expect(rendered).toContain('See ' + path + ':12.');
  expect(rendered).toContain('Sources');
});
