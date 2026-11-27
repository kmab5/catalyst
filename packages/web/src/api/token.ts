const STORAGE_KEY = 'catalyst.token';

export function getToken(): string | null {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="catalyst-token"]');
    const content = meta?.getAttribute('content');
    if (content && content.trim().length > 0 && content !== '__CATALYST_TOKEN__') {
      return content.trim();
    }
  }

  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    const param = url.searchParams.get('token');
    if (param) {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, param);
      } catch {
        // ignore storage restrictions
      }
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
      return param;
    }

    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    } catch {
      // ignore
    }
  }

  return null;
}
