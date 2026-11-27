import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ids } from '@/api/contract';
import { installMockFetch } from '@/test/mockFetch';
import { renderWorkflow } from '@/test/renderWorkflow';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('keyboard opens Find, Search, and Ask, then Enter starts the question', async () => {
  vi.stubGlobal('fetch', fetch);
  installMockFetch();
  const user = userEvent.setup();
  const { router } = renderWorkflow('/features');
  await user.keyboard('{Control>}k{/Control}');
  await user.type(screen.getByRole('combobox', { name: /search or ask/i }), 'stripe webhook');
  expect(await screen.findByText('Find')).toBeVisible();
  expect(await screen.findByText('Search')).toBeVisible();
  expect(screen.getByRole('option', { name: /ask: stripe webhook/i })).toBeVisible();
  await user.keyboard('{Enter}');
  expect(router.state.location.pathname).toMatch(/\/ask$/);
  expect(new URLSearchParams(router.state.location.search).get('q')).toBe('stripe webhook');
});

test('single-word Find takes priority and Ctrl+Enter opens its node in Graph', async () => {
  vi.stubGlobal('fetch', fetch);
  installMockFetch();
  const user = userEvent.setup();
  const { router } = renderWorkflow('/features');
  await user.click(screen.getByRole('button', { name: /search or ask/i }));
  await user.type(screen.getByRole('combobox', { name: /search or ask/i }), 'session');
  await waitFor(() =>
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('session.ts'),
  );
  await user.keyboard('{Control>}{Enter}{/Control}');
  expect(router.state.location.pathname).toMatch(/\/graph$/);
  expect(new URLSearchParams(router.state.location.search).get('focus')).toBe(
    ids.file('lib/session.ts'),
  );
});
