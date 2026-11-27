import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ids } from '@/api/contract';
import { installMockFetch } from '@/test/mockFetch';
import { renderWorkflow } from '@/test/renderWorkflow';

beforeEach(() => {
  vi.stubGlobal('fetch', fetch);
  installMockFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('the shared feature follows all named categories', async () => {
  renderWorkflow('/features');
  const rows = await screen.findAllByTestId('feature-row');
  expect(rows.at(-1)).toHaveTextContent(/shared/i);
  expect(rows[0]?.querySelector('a')?.getAttribute('href')).toContain('/features/');
});
test('the detail distinguishes inferred steps and explains changeability', async () => {
  renderWorkflow('/features/' + encodeURIComponent(ids.feature('Billing Subscriptions')));
  const steps = await screen.findAllByTestId('flow-step');
  expect(steps[0]).toHaveTextContent('1');
  expect(screen.getAllByTestId('flow-hop').some((h) => h.dataset.verified === 'false')).toBe(true);
  const card = screen.getByRole('region', { name: /how easy is it to change/i });
  for (const op of ['Add', 'Change', 'Remove']) expect(within(card).getByText(op)).toBeVisible();
  expect(screen.getByRole('heading', { name: /entry points/i })).toBeVisible();
  expect(screen.getByRole('heading', { name: /^core/i })).toBeVisible();
});
