import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ids } from '@catalyst/shared';
import { getFixture, installMockFetch } from '@/test/mockFetch';
import { Explorer } from './Explorer';
import { renderPage } from '@/test/renderPage';
// Transform lazy chunks during collection, outside the user-interaction timeout.
import './explorer/XRayPanel';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});
const fixture = getFixture();
const pid = fixture.projects[0]!.id;
const fileId = ids.file('lib/session.ts');

test('deep link selects a symbol with route groups and brackets', async () => {
  const path = 'app/(dashboard)/editor/[postId]/page.tsx';
  const nodeId = ids.sym(path, 'default');
  const node = fixture.nodes[fileId]!;
  installMockFetch({
    ...fixture,
    nodes: {
      ...fixture.nodes,
      [nodeId]: {
        ...node,
        node: { ...node.node, id: nodeId, kind: 'symbol', name: 'default', filePath: path },
      },
    },
  });
  renderPage(<Explorer />, `/p/${pid}/explorer?node=${encodeURIComponent(nodeId)}`, '/p/:pid/:page');
  expect(await screen.findByTestId('xray-panel')).toHaveAttribute('data-node', nodeId);
});

test('X-Ray shows the specified sections and uses the selected node for impact', async () => {
  installMockFetch();
  renderPage(<Explorer />, `/p/${pid}/explorer?node=${encodeURIComponent(fileId)}`, '/p/:pid/:page');
  const panel = within(await screen.findByTestId('xray-panel'));
  for (const name of [
    'What it does',
    'Where it sits',
    'Connections',
    'Side effects',
    'If you change this',
    'Health',
    'Provenance',
  ]) {
    expect(await panel.findByRole('heading', { name })).toBeInTheDocument();
  }
  expect(panel.getByRole('link', { name: 'Show in graph' })).toHaveAttribute(
    'href',
    `/p/${pid}/graph?focus=${encodeURIComponent(fileId)}&depth=3`,
  );
  fireEvent.click(panel.getByRole('button', { name: 'Full list' }));
  expect(await panel.findByTestId('impact-list')).toBeInTheDocument();
});

test('tree selection updates the URL and outline selection highlights the source range', async () => {
  installMockFetch();
  const router = renderPage(<Explorer />, `/p/${pid}/explorer`, '/p/:pid/:page').router;
  fireEvent.click(await screen.findByRole('button', { name: 'lib' }));
  fireEvent.click(await screen.findByRole('button', { name: 'session.ts' }));
  expect(new URLSearchParams(router.state.location.search).get('node')).toBe(fileId);
  const outline = await screen.findByRole('navigation', { name: 'Outline' });
  fireEvent.click(within(outline).getByRole('button', { name: 'getCurrentUser' }));
  await waitFor(() => expect(document.querySelector('[data-line="5"]')).toHaveClass('line-highlight'));
  expect(new URLSearchParams(router.state.location.search).get('line')).toBe('5');
});

test('a deep link into a large file requests the window containing the selected line', async () => {
  const code = fixture.sources[fileId]!;
  installMockFetch(fixture, {
    [`GET /api/projects/${pid}/nodes/${encodeURIComponent(fileId)}/source`]: (req) => {
      const start = Number(new URL(req.url).searchParams.get('start'));
      expect(start).toBe(2001);
      return Response.json({
        ...code,
        startLine: 2001,
        endLine: 2002,
        totalLines: 2002,
        text: 'first\nsecond',
      });
    },
  });
  renderPage(
    <Explorer />,
    `/p/${pid}/explorer?node=${encodeURIComponent(fileId)}&line=2002`,
    '/p/:pid/:page',
  );
  await waitFor(() =>
    expect(document.querySelector('[data-line="2002"]')).toHaveClass('line-highlight'),
  );
});

test('provenance shows the recorded summary model and generation time when available', async () => {
  const createdAt = Date.UTC(2026, 10, 27, 9, 30);
  installMockFetch({
    ...fixture,
    nodes: {
      ...fixture.nodes,
      [fileId]: { ...fixture.nodes[fileId]!, summaryMeta: { model: 'fixture-model', createdAt } },
    },
  });
  renderPage(<Explorer />, `/p/${pid}/explorer?node=${encodeURIComponent(fileId)}`, '/p/:pid/:page');
  const panel = within(await screen.findByTestId('xray-panel'));
  fireEvent.click(await panel.findByRole('heading', { name: 'Provenance' }));
  expect(panel.getByText('fixture-model')).toBeVisible();
  expect(panel.getByText(new Date(createdAt).toLocaleString()).closest('time')).toHaveAttribute(
    'datetime',
    new Date(createdAt).toISOString(),
  );
});
