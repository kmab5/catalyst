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

let refreshing: Promise<string | null> | undefined;

async function readLaunchToken(): Promise<string | null> {
  const page = await fetch('/', { cache: 'no-store', redirect: 'error', headers: { Accept: 'text/html' } });
  if (!page.ok || !page.headers.get('Content-Type')?.includes('text/html')) return null;
  const fresh = new DOMParser().parseFromString(await page.text(), 'text/html')
    .querySelector('meta[name="catalyst-token"]')?.getAttribute('content');
  if (!fresh) return null;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="catalyst-token"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'catalyst-token';
    document.head.append(meta);
  }
  meta.content = fresh;
  return fresh;
}

/** The server rejects outdated launch tokens before dispatching a protected route. */
export async function fetchWithToken(path: string, init: RequestInit): Promise<Response> {
  const original = getToken();
  const headers = new Headers(init.headers);
  if (original) headers.set('X-Catalyst-Token', original);
  const response = await fetch(path, { ...init, headers });
  if (response.status !== 401 || init.signal?.aborted) return response;
  let token = getToken();
  if (token === original) {
    refreshing ??= readLaunchToken().finally(() => { refreshing = undefined; });
    token = await refreshing;
  }
  if (!token || token === original || init.signal?.aborted) return response;
  headers.set('X-Catalyst-Token', token);
  return fetch(path, { ...init, headers });
}
