import type { Severity } from '@/api/contract';
import { cn } from '@/lib/cn';

const SEV_COLOR: Record<Severity, { dot: string; bg: string; text: string }> = {
  high: {
    dot: 'bg-[var(--sev-high)]',
    bg: 'bg-[var(--sev-high-soft)]',
    text: 'text-[var(--sev-high)]',
  },
  warn: {
    dot: 'bg-[var(--sev-warn)]',
    bg: 'bg-[var(--sev-warn-soft)]',
    text: 'text-[var(--sev-warn)]',
  },
  info: {
    dot: 'bg-[var(--sev-info)]',
    bg: 'bg-[var(--sev-info-soft)]',
    text: 'text-[var(--sev-info)]',
  },
};

export function FlagBadge({
  severity,
  rule,
  className,
}: {
  severity: Severity;
  rule: string;
  className?: string;
}) {
  const style = SEV_COLOR[severity];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        style.bg,
        style.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} aria-hidden="true" />
      <span>{rule}</span>
    </span>
  );
}
