import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router';
import { Settings } from './Settings';
import { getFixture, installMockFetch } from '../test/mockFetch';
import { renderPage } from '../test/renderPage';

beforeEach(() => vi.stubGlobal('fetch', fetch));
afterEach(() => vi.unstubAllGlobals());

test('Back returns to the exact project view, including its selection', async () => {
  installMockFetch();
  const url = '/p/demo/explorer?node=file%3Ahello.ts';
  const { router } = renderPage(<Link to="/settings">Settings</Link>, url, '/p/:pid/explorer', [
    { path: '/settings', element: <Settings /> },
  ]);
  await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
  expect(router.state.location.pathname + router.state.location.search).toBe(url);
});

test('Back opens the launcher when Settings is opened directly', async () => {
  installMockFetch();
  const { router } = renderPage(<Settings />, '/settings', '/settings', [{ path: '/', element: <p>Launcher</p> }]);
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(router.state.location.pathname).toBe('/');
});

test('selecting Groq replaces the previous models and saves a Groq credential', async () => {
  const fixture = getFixture();
  let update: unknown;
  installMockFetch(fixture, {
    'PUT /api/settings': async req => {
      update = await req.json();
      return Response.json({ ...fixture.settings, provider: { ...fixture.settings.provider, type: 'groq' },
        models: { fast: 'openai/gpt-oss-20b', smart: 'openai/gpt-oss-120b' } });
    },
  });
  renderPage(<Settings />);
  await userEvent.click(await screen.findByRole('radio', { name: /^Groq\b/i }));
  expect(screen.getByText('Save this change to use Groq for new AI requests.')).toBeVisible();
  expect(screen.getByRole('radio', { name: /OpenRouter Active/i })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('API key'), 'synthetic-groq');
  await userEvent.click(screen.getByRole('button', { name: 'Save provider' }));
  expect(await screen.findByRole('radio', { name: /Groq Active/i })).toBeChecked();
  expect(update).toMatchObject({
    provider: { type: 'groq', apiKey: 'synthetic-groq' },
    models: { fast: 'openai/gpt-oss-20b', smart: 'openai/gpt-oss-120b' },
  });
});

test('shows only the masked key and can remove it explicitly', async () => {
  const fixture = getFixture();
  let update: unknown;
  installMockFetch(fixture, {
    'PUT /api/settings': async (req) => {
      update = await req.json();
      return Response.json({ ...fixture.settings, provider: null });
    },
  });
  renderPage(<Settings />);
  expect(await screen.findByText(/sk-or-…9f2a/)).toBeVisible();
  expect(screen.getByText(/sends file contents and summaries to OpenRouter/i)).toBeVisible();
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
  installMockFetch(fixture, { 'PUT /api/settings': save });
  renderPage(<Settings />);
  await screen.findByText(/sk-or-…9f2a/);
  expect(screen.getByText(/Claude Code CLI \(detected/i)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Test connection' }));
  expect(await screen.findByText(/Connected · 320 ms/)).toBeVisible();
  await userEvent.type(screen.getByLabelText(/Fast model/i), '-custom');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(save).toHaveBeenCalledOnce();
});
