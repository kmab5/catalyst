import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

const NAV_MAP: Record<string, string> = {
  o: 'overview',
  f: 'features',
  e: 'explorer',
  g: 'graph',
  h: 'health',
  a: 'ask',
};

export function useNavShortcuts(pid: string | undefined, onOpenPalette: () => void): void {
  const navigate = useNavigate();
  const pendingG = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenPalette();
        return;
      }

      if (isInput || !pid) return;

      const key = e.key.toLowerCase();
      if (pendingG.current) {
        pendingG.current = false;
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        const sub = NAV_MAP[key];
        if (sub) {
          e.preventDefault();
          navigate(`/p/${pid}/${sub}`);
        }
        return;
      }

      if (key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        pendingG.current = true;
        timerRef.current = window.setTimeout(() => {
          pendingG.current = false;
        }, 800);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [pid, navigate, onOpenPalette]);
}
