import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ids, type DiffImpactDTO } from '@/api/contract';
import { installMockFetch, getFixture } from '@/test/mockFetch';
import { projectPath, renderWorkflow } from '@/test/renderWorkflow';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('shows affected features and routes and carries the comparison into Graph', async () => {
  vi.stubGlobal('fetch', fetch);
  const f = getFixture();
  const file = f.nodes[ids.file('lib/session.ts')]!.node;
  const route = f.overview.entryPoints.find((n) => n.kind === 'route')!;
  const diff: DiffImpactDTO = {
    base: 'main',
    head: 'WORKTREE',
    changedFiles: [{ path: file.filePath!, status: 'modified' }],
    changedNodes: [file],
    affected: {
      nodes: [{ ...route, distance: 1 }],
      features: [
        { featureId: f.features[0]!.id, name: f.features[0]!.name, changed: 1, affected: 2 },
      ],
      routes: [route],
    },
    flagsTouched: [],
    narrative: null,
  };
  installMockFetch(f, {
    ['POST /api/projects/' + f.projects[0]!.id + '/impact/diff']: () => Response.json(diff),
  });
  const { router } = renderWorkflow('/impact?base=main');
  const features = await screen.findByRole('region', { name: /affected features/i });
  expect(within(features).getByRole('link', { name: f.features[0]!.name })).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: /affected routes/i })).getByRole('link', {
      name: route.name,
    }),
  ).toBeVisible();
  const graphLink = screen.getByRole('link', { name: 'Show in graph' });
  expect(graphLink.getAttribute('href')).toContain('diff=1');
  await userEvent.click(graphLink);
  expect(router.state.location.pathname).toBe(projectPath + '/graph');
  expect(router.state.location.state.changedIds).toContain(file.id);
});

test('explains when an indexed folder has no Git working tree', async () => {
  vi.stubGlobal('fetch', fetch);
  const f = getFixture();
  installMockFetch(f, {
    ['POST /api/projects/' + f.projects[0]!.id + '/impact/diff']: () => Response.json({
      unavailable: 'not-a-work-tree', base: 'HEAD', head: 'WORKTREE', changedFiles: [],
      changedNodes: [], affected: { nodes: [], features: [], routes: [] }, flagsTouched: [], narrative: null,
    }),
  });
  renderWorkflow('/impact');
  expect(await screen.findByRole('heading', { name: 'This folder has no Git working tree.' })).toBeVisible();
  expect(screen.queryByRole('combobox')).toBeNull();
});
