const STORAGE_KEY = 'catalyst.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const param = url.searchParams.get('token');
  // Keep the launcher credential out of browser history and subsequent links.
  if (param !== null) {
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', url);
  }
  const meta = document.querySelector('meta[name="catalyst-token"]')?.getAttribute('content')?.trim();
  const token = meta && meta !== '__CATALYST_TOKEN__' ? meta : param;
  try {
    if (token) window.sessionStorage.setItem(STORAGE_KEY, token);
    return token || window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return token || null;
  }
}
