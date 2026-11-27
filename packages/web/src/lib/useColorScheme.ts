import { useSyncExternalStore } from 'react';

function subscribe(update: () => void) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  media?.addEventListener('change', update);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', update);
  };
}

function read(): 'light' | 'dark' {
  const preference = document.documentElement.dataset.theme;
  if (preference === 'dark' || preference === 'light') return preference;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useColorScheme() {
  return useSyncExternalStore(subscribe, read);
}
