import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { api } from '@/api/client';
import { getFixture, installMockFetch } from '@/test/mockFetch';
import { renderWorkflow } from '@/test/renderWorkflow';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('the stopped-server banner clears and retries active failed queries after health recovers', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
  renderWorkflow('/features');
  expect(await screen.findByText(/Catalyst isn't running/)).toBeVisible();
  installMockFetch();
  await waitFor(() => expect(screen.queryByText(/Catalyst isn't running/)).toBeNull(), {
    timeout: 4800,
  });
  expect((await screen.findAllByTestId('feature-row')).length).toBeGreaterThan(0);
});
test('a new run header offers a refresh without discarding the current route', async () => {
  vi.stubGlobal('fetch', fetch);
  installMockFetch();
  const f = getFixture(),
    pid = f.projects[0]!.id;
  const { router } = renderWorkflow('/features');
  await screen.findAllByTestId('feature-row');
  installMockFetch(f, {
    ['GET /api/projects/' + pid + '/features']: () =>
      Response.json(f.features, { headers: { 'X-Catalyst-Index': 'new-run' } }),
  });
  await act(() => api.features.list(pid).then(() => undefined));
  const refresh = await screen.findByRole('button', { name: /new results available/i });
  installMockFetch();
  await userEvent.click(refresh);
  expect(router.state.location.pathname).toMatch(/\/features$/);
  await waitFor(() => expect(screen.queryByText(/new results available/i)).toBeNull());
});

test('ready projects can re-index through the switcher and review an estimate before AI', async () => {
  vi.stubGlobal('fetch', fetch);
  const fixture = structuredClone(getFixture());
  fixture.projects[0]!.aiStatus = 'skipped';
  const started = vi.fn(() => Response.json({ runId: 'new-run' }));
  installMockFetch(fixture, {
    ['POST /api/projects/' + fixture.projects[0]!.id + '/index']: started,
  });
  const { router } = renderWorkflow('/features');
  await userEvent.click(await screen.findByRole('button', { name: 'Switch project' }));
  await userEvent.click(screen.getByRole('button', { name: 'Re-index' }));
  await waitFor(() => expect(router.state.location.pathname).toMatch(/\/indexing$/));
  expect(router.state.location.state).toEqual({ reviewExisting: true });
  expect(started).not.toHaveBeenCalled();
});
