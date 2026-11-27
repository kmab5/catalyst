import { expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import { ids } from '@/api/contract';
import { renderPage } from '@/test/renderPage';
import { Markdown } from './Markdown';

test('links grounded citations containing dynamic route segments and leaves unknown citations as text', () => {
  const path = 'app/(dashboard)/[postId]/page.tsx';
  const id = ids.sym(path, 'default');
  renderPage(
    <Markdown
      text={`See [[${id}]] and [[sym:nope.ts#x]].`}
      citations={[
        { id, name: 'default', kind: 'symbol', filePath: path, startLine: 3, provenance: 'ast' },
      ]}
    />,
    '/p/project/ask',
    '/p/:pid/ask',
  );
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    `/p/project/explorer?node=${encodeURIComponent(id)}&line=3`,
  );
  expect(screen.getByText('nope.ts#x')).toHaveClass('text-muted');
});
