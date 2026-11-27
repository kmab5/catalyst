import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from './Settings';
import { getFixture, installMockFetch } from '../test/mockFetch';
import { renderPage } from '../test/renderPage';

beforeEach(() => vi.stubGlobal('fetch', fetch));
afterEach(() => vi.unstubAllGlobals());

test('shows only the masked key and can remove it explicitly', async () => {
  const fixture = getFixture();
  let update: unknown;
  installMockFetch(fixture, { 'PUT /api/settings': async req => {
    update = await req.json();
    return Response.json({ ...fixture.settings, provider: null });
  } });
  renderPage(<Settings />);
  expect(await screen.findByText(/sk-or-…9f2a/)).toBeVisible();
  expect(screen.getByLabelText('API key')).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: 'Remove saved key' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(update).toMatchObject({ provider: { type: 'openrouter', apiKey: null } });
});

test('changing a model preserves credentials and connection testing reports latency', async () => {
  const fixture = getFixture();
  const save = vi.fn(async (req: Request) => {
    const body = await req.json();
    expect(body).not.toHaveProperty('provider');
    return Response.json(fixture.settings);
  });
  installMockFetch(fixture, {'PUT /api/settings': save});
  renderPage(<Settings />);
  await screen.findByText(/sk-or-…9f2a/);
  expect(screen.getByText(/Claude Code CLI \(detected/i)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Test connection' }));
  expect(await screen.findByText(/Connected · 320 ms/)).toBeVisible();
  await userEvent.type(screen.getByLabelText(/Fast model/i), '-custom');
  await userEvent.click(screen.getByRole('button', {name: 'Save'}));
  expect(save).toHaveBeenCalledOnce();
});
