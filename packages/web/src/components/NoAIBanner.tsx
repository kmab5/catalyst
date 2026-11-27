import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { t } from '@/i18n/t';
import { cn } from '@/lib/cn';

const CONTEXT_NOTE: Record<'overview' | 'features' | 'ask' | 'xray', string> = {
  overview: 'Showing detected stack, entry points, and health structure.',
  features: 'Showing structural groupings. Connect an AI provider to name features and trace flows.',
  ask: 'Ask requires an AI provider. You can still use Find and Search (⌘K).',
  xray: 'Showing static callers, callees, side effects, and health flags.',
};

export function NoAIBanner({
  context,
  className,
}: {
  context: 'overview' | 'features' | 'ask' | 'xray';
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 mt-0.5 text-[var(--text-muted)] shrink-0" />
        <div>
          <p className="font-medium text-[var(--text)]">{t('banner.noAi')}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {CONTEXT_NOTE[context]}
          </p>
        </div>
      </div>
      <Link
        to="/settings"
        className="inline-flex items-center rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 shrink-0"
      >
        {t('banner.connectAi')}
      </Link>
    </div>
  );
}
