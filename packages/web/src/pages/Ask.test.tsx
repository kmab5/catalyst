import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFixture, installMockFetch } from '@/test/mockFetch';
import { renderWorkflow, projectPath } from '@/test/renderWorkflow';
beforeEach(() => {
  vi.stubGlobal('fetch', fetch);
  installMockFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('an Ask deep link streams an answer with local sources and a collapsed trace', async () => {
  renderWorkflow('/ask?q=' + encodeURIComponent('Where do we handle Stripe webhooks?'));
  expect((await screen.findAllByRole('link', { name: /route\.ts/i })).length).toBeGreaterThan(0);
  expect(screen.getByText(/looked at/i).closest('details')).not.toHaveAttribute('open');
});
test('not-found answers show what was checked', async () => {
  renderWorkflow('/ask?q=' + encodeURIComponent('Do we have password reset?'));
  expect(await screen.findByRole('heading', { name: /not found/i })).toBeVisible();
  expect(screen.getByRole('list', { name: /checked/i }).children.length).toBeGreaterThan(0);
});
test('an unavailable provider offers deterministic search seeded with the question', async () => {
  installMockFetch(undefined, {
    ['POST /api/projects/' + projectPath.slice(3) + '/ask']: () =>
      Response.json(
        { error: { code: 'AI_NOT_CONFIGURED', message: 'Choose a provider' } },
        { status: 412 },
      ),
  });
  renderWorkflow('/ask?q=login');
  await userEvent.click(await screen.findByRole('button', { name: /search instead/i }));
  expect(screen.getByRole('combobox', { name: /search or ask/i })).toHaveValue('login');
});

test('a structure-only project can ask questions after a provider is connected', async () => {
  const f = structuredClone(getFixture());
  f.projects[0]!.aiStatus = 'skipped';
  installMockFetch(f);
  renderWorkflow('/ask');
  await userEvent.click(await screen.findByRole('button', { name: 'Do we have password reset?' }));
  expect(await screen.findByRole('heading', { name: /Not found/i })).toBeVisible();
});
