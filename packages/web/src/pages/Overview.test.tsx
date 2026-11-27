import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Overview } from './Overview';
import { getFixture, installMockFetch } from '@/test/mockFetch';
import { renderPage } from '@/test/renderPage';

beforeEach(() => vi.stubGlobal('fetch', fetch));
afterEach(() => vi.unstubAllGlobals());
test('shows a grounded overview and links each feature to its detail page', async () => {
  const f = getFixture();
  const pid = f.projects[0]!.id;
  installMockFetch(f);
  renderPage(<Overview />, `/p/${pid}/overview`, '/p/:pid/overview');
  expect(
    await screen.findByRole('heading', { level: 1, name: f.overview.overview!.oneLiner }),
  ).toBeVisible();
  const cards = screen.getAllByTestId('feature-card');
  expect(cards).toHaveLength(f.features.length);
  for (const item of f.features)
    expect(cards.find((c) => c.textContent?.includes(item.name))).toHaveAttribute(
      'href',
      `/p/${pid}/features/${encodeURIComponent(item.id)}`,
    );
  expect(await screen.findByRole('link', { name: 'session.ts#getCurrentUser' })).toBeVisible();
});
test('a structure-only project still displays the stack, entries and health', async () => {
  const f = getFixture();
  f.overview.overview = null;
  installMockFetch(f);
  renderPage(<Overview />, '/p/demo/overview', '/p/:pid/overview');
  expect(await screen.findByText(/connect an AI to get/i)).toBeVisible();
  expect(screen.getByText('Next.js')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Structure health' })).toBeVisible();
});

test('requests the overview in the language of the deep link', async () => {
  const fixture = getFixture();
  const pid = fixture.projects[0]!.id;
  installMockFetch(fixture, {
    [`GET /api/projects/${pid}/overview`]: (request) => {
      const language = new URL(request.url).searchParams.get('lang');
      return Response.json({
        ...fixture.overview,
        overview: {
          ...fixture.overview.overview,
          oneLiner: language === 'tr' ? 'Türkçe özet' : 'English overview',
        },
      });
    },
  });
  renderPage(<Overview />, `/p/${pid}/overview?lang=tr`, '/p/:pid/overview');
  expect(await screen.findByRole('heading', { name: 'Türkçe özet' })).toBeVisible();
});
