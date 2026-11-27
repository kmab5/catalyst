import { expect, test } from 'vitest';
import { highlight } from './shiki';

test('unknown languages display escaped plain text', async () => {
  const html = await highlight('<img src=x> &', 'cobol', 'light');
  const fragment = new DOMParser().parseFromString(html, 'text/html');
  expect(fragment.querySelector('img')).toBeNull();
  expect(fragment.body.textContent).toContain('<img src=x> &');
});
test('highlights TypeScript and preserves multiline tokens', async () => {
  const html = await highlight('/* open\nclose */\nconst x = 1', 'typescript', 'dark');
  expect(html).toMatch(/style="color:/);
  expect(html).toContain('close */');
});
