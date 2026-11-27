import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { routes } from '../routes';
import { t } from '../i18n/t';

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  test('shell renders nav items and search trigger', () => {
    renderAt('/p/abc123/overview');
    for (const k of ['Overview', 'Features', 'Explorer', 'Graph', 'Health', 'Ask']) {
      expect(screen.getByRole('link', { name: k })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /search or ask anything/i })).toBeInTheDocument();
  });

  test('t() interpolates', () => {
    expect(t('health.count', { n: 3 })).toBe('3 issues');
  });
});
