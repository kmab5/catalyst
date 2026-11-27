import type { Provenance } from '@/api/contract';
import { t } from '@/i18n/t';
import { cn } from '@/lib/cn';

export function ProvenanceBadge({
  provenance,
  confidence,
  className,
}: {
  provenance: Provenance;
  confidence?: number;
  className?: string;
}) {
  const text = t(`provenance.${provenance}`);
  const label =
    provenance === 'inferred' && confidence !== undefined
      ? `${text} · ${Math.round(confidence * 100)}%`
      : text;

  return (
    <span
      title={t(`provenance.${provenance}.help`)}
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium border',
        provenance === 'heuristic' || provenance === 'inferred'
          ? 'border-dashed border-[var(--border)] text-[var(--text-muted)]'
          : 'border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface-2)]',
        className,
      )}
    >
      {label}
    </span>
  );
}
