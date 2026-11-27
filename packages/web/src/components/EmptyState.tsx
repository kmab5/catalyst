import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center max-w-lg mx-auto my-8',
        className,
      )}
    >
      <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">{body}</p>
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}
