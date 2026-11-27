import { afterEach, expect, test, vi } from 'vitest';
import { getToken, fetchWithToken } from './token';
afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; sessionStorage.clear(); history.replaceState(null, '', '/'); });

test('removes bootstrap token even when the page already has the authoritative meta token', () => {
  document.head.innerHTML = '<meta name="catalyst-token" content="current">';
  history.replaceState({key:'preserved'}, '', '/?suggest=demo&token=bootstrap');
  expect(getToken()).toBe('current');
  expect(location.search).toBe('?suggest=demo');
  expect(history.state).toEqual({key:'preserved'});
  document.head.innerHTML = '';
  expect(getToken()).toBe('current');
});

test('retries a rejected mutation once with the new engine launch token', async () => {
  document.head.innerHTML = '<meta name="catalyst-token" content="before-restart">';
  const sent: (string | null)[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    if (path === '/') return new Response('<meta name="catalyst-token" content="after-restart">', { headers: { 'Content-Type': 'text/html' } });
    sent.push(new Headers(init.headers).get('X-Catalyst-Token'));
    return new Response(null, {status: sent.length === 1 ? 401 : 200});
  });
  expect((await fetchWithToken('/api/projects', {method: 'POST', body: '{}'})).status).toBe(200);
  expect(sent).toEqual(['before-restart', 'after-restart']);
  expect(getToken()).toBe('after-restart');
});
