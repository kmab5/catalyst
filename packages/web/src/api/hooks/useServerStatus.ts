import { useEffect, useState } from 'react';
import { api, onServerBack, onServerGone } from '../client';

export function useServerStatus() {
  const [serverGone, setServerGone] = useState(false);

  useEffect(() => {
    const offGone = onServerGone(() => setServerGone(true));
    const offBack = onServerBack(() => setServerGone(false));
    return () => {
      offGone();
      offBack();
    };
  }, []);

  useEffect(() => {
    if (!serverGone) return;
    const id = window.setInterval(() => {
      void api
        .health()
        .then(() => setServerGone(false))
        .catch(() => {
          // keep polling
        });
    }, 3000);
    return () => window.clearInterval(id);
  }, [serverGone]);

  return { serverGone };
}
