import { afterEach, expect, test } from 'vitest';
import { getToken } from './token';
afterEach(() => { document.head.innerHTML = ''; sessionStorage.clear(); history.replaceState(null, '', '/'); });

test('removes bootstrap token even when the page already has the authoritative meta token', () => {
  document.head.innerHTML = '<meta name="catalyst-token" content="current">';
  history.replaceState({key:'preserved'}, '', '/?suggest=demo&token=bootstrap');
  expect(getToken()).toBe('current');
  expect(location.search).toBe('?suggest=demo');
  expect(history.state).toEqual({key:'preserved'});
  document.head.innerHTML = '';
  expect(getToken()).toBe('current');
});
