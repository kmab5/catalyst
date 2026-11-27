import { afterEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPage } from '@/test/renderPage';
import { getFixture, installMockFetch } from '@/test/mockFetch';
import { Launcher } from './Launcher';

afterEach(() => vi.unstubAllGlobals());

test('prefills the CLI suggestion and starts a run when opening an unindexed recent project', async () => {
  vi.stubGlobal('fetch', fetch);
  const fixture = getFixture();
  const project = fixture.projects[1]!;
  const start = vi.fn(() => Response.json({runId: 'new-run'}));
  installMockFetch(fixture, { [`POST /api/projects/${project.id}/index`]: start });
  const {router} = renderPage(<Launcher />, '/?suggest=C%3A%2Fcode', '/', [
    {path: '/p/:pid/indexing', element: <p>Indexing project</p>},
    {path: '/p/:pid/overview', element: <p>Overview</p>},
  ]);
  expect(screen.getByLabelText('Folder path')).toHaveValue('C:/code');
  await userEvent.click(await screen.findByRole('button', {name: /backend.*never-indexed/i}));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/p/${project.id}/indexing`));
  expect(start).toHaveBeenCalledOnce();
});
