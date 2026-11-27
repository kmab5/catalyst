import { expect, test } from '@playwright/test';
import { GraphResponse, HealthResponse, ids } from '@catalyst/shared';

test('phone navigation exposes every workspace view and the repository actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /ts-basic.*ready/i }).first().click();
  const navigation = page.getByRole('navigation', { name: 'Project navigation' });
  for (const name of ['Overview', 'Features', 'Explorer', 'Graph', 'Health', 'Impact', 'Ask']) {
    await expect(navigation.getByRole('link', { name, exact: true })).toBeInViewport();
  }
  await page.getByRole('link', { name: 'Browse source files' }).click();
  await expect(page.getByTestId('page-explorer')).toBeVisible();
  await navigation.getByRole('link', { name: 'Impact' }).click();
  await expect(page).toHaveURL(/\/impact$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('open a structural index and explore the fixture', async ({ page, request }) => {
  const health = HealthResponse.parse(await (await request.get('/api/health')).json());
  expect(health.mock).toBe(false);
  await page.goto('/');
  await page.getByRole('button', { name: /ts-basic.*ready/i }).first().click();
  await expect(page).toHaveURL(/\/p\/[^/]+\/overview$/);
  await expect(page.getByText('Next.js', { exact: true }).first()).toBeVisible();
  const base = new URL(page.url()).pathname.replace(/\/overview$/, '');
  const id = ids.file('lib/session.ts');
  await page.goto(base + '/explorer?node=' + encodeURIComponent(id));
  await expect(page.getByTestId('xray-panel')).toHaveAttribute('data-node', id);
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
  const graphRequest = page.waitForResponse(res => /\/api\/projects\/[^/]+\/graph(?:\?|$)/.test(res.url()) && res.ok());
  await page.goto(base + '/graph?level=file');
  expect(GraphResponse.parse(await (await graphRequest).json()).nodes.length).toBeGreaterThan(0);
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.getByRole('link', { name: /health/i }).click();
  await expect(page.getByText(/cycle/i).first()).toBeVisible();
  await expect(page.getByText(/\ba\.ts\b/).first()).toBeVisible();
  await expect(page.getByText(/\bb\.ts\b/).first()).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill('session');
  await expect(page.getByRole('option').filter({ hasText: /session\.ts/ }).first()).toBeVisible();
});
