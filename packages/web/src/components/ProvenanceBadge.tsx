import type { Provenance } from '@/api/contract';
import { cn } from '@/lib/cn';

const LABELS: Record<Provenance, { text: string; help: string }> = {
  ast: {
    text: 'AST',
    help: 'Read directly from the syntax tree.',
  },
  resolved: {
    text: 'Resolved',
    help: 'Followed import bindings to the defining file.',
  },
  heuristic: {
    text: 'Heuristic',
    help: 'Matched by name or pattern without a direct binding.',
  },
  inferred: {
    text: 'AI-inferred',
    help: 'Inferred by the AI model from code context.',
  },
};

export function ProvenanceBadge({
  provenance,
  confidence,
  className,
}: {
  provenance: Provenance;
  confidence?: number;
  className?: string;
}) {
  const meta = LABELS[provenance];
  const label =
    provenance === 'inferred' && confidence !== undefined
      ? `${meta.text} · ${Math.round(confidence * 100)}%`
      : meta.text;

  return (
    <span
      title={meta.help}
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
