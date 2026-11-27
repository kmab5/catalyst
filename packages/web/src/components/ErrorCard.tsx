import { Link } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { ApiError } from '@/api/errors';
import { t } from '@/i18n/t';

export function ErrorCard({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const apiErr = error instanceof ApiError ? error : null;
  const message =
    error instanceof Error ? error.message : t('common.error');

  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--sev-high)]/30 bg-[var(--sev-high-soft)] p-4 text-sm"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 mt-0.5 text-[var(--sev-high)] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--text)]">{message}</p>
          {apiErr?.code && (
            <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
              {apiErr.code}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
              >
                {t('common.retry')}
              </button>
            )}
            {apiErr?.code === 'PROVIDER_ERROR' && (
              <Link
                to="/settings"
                className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                {t('errors.provider')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
