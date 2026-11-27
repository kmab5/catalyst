import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerStatus } from '@/api/hooks/useServerStatus';
import { t } from '@/i18n/t';

export function ServerGoneBanner() {
  const { serverGone } = useServerStatus();
  const client = useQueryClient();
  const previous = useRef(false);
  useEffect(() => {
    if (previous.current && !serverGone)
      void client.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' });
    previous.current = serverGone;
  }, [serverGone, client]);
  return serverGone ? (
    <div
      role="alert"
      className="border-b border-[var(--sev-warn)] bg-[var(--sev-warn-soft)] px-4 py-2 text-center text-sm"
    >
      {t('banner.serverGone')}
    </div>
  ) : null;
}
