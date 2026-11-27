import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { getFixture, installMockFetch } from '@/test/mockFetch';
import { renderPage } from '@/test/renderPage';
// Transform lazy chunks during collection, outside the user-interaction timeout.
import './graph/GraphCanvas';
import { Graph } from './Graph';

const originalFetch = globalThis.fetch;
const fixture = getFixture();
const pid = fixture.projects[0]!.id;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
test('a truncated response offers focus and feature filters without mounting a canvas', async () => {
  installMockFetch(fixture, {
    [`GET /api/projects/${pid}/graph`]: () =>
      Response.json({ ...fixture.graph.file, truncated: true, totalNodes: 2400 }),
  });
  renderPage(<Graph />, `/p/${pid}/graph?level=file`, '/p/:pid/:page');
  expect(await screen.findByText(/too many/i)).toBeInTheDocument();
  expect(screen.queryByTestId('graph-canvas')).toBeNull();
  expect(screen.getByRole('searchbox')).toBeInTheDocument();
});
test('graph level, focus depth and filters persist in the URL', async () => {
  installMockFetch();
  const router = renderPage(
    <Graph />,
    `/p/${pid}/graph?level=file&edgeKinds=imports`,
    '/p/:pid/:page',
  ).router;
  await screen.findByTestId('graph-canvas');
  fireEvent.click(screen.getByText('Filters'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'calls' }));
  expect(new URLSearchParams(router.state.location.search).get('edgeKinds')).toBe('imports,calls');
  fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } });
  expect(new URLSearchParams(router.state.location.search).get('depth')).toBe('4');
  fireEvent.click(screen.getByRole('button', { name: 'Features' }));
  expect(new URLSearchParams(router.state.location.search).get('level')).toBe('feature');
});
