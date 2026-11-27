import { Link, useParams } from 'react-router';
import type { NodeRef } from '@/api/contract';

function shortLabel(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

export function CitationChip({
  id,
  nodeRef,
  onSelect,
}: {
  id: string;
  nodeRef?: NodeRef;
  onSelect?: (id: string) => void;
}) {
  const { pid } = useParams<{ pid: string }>();

  if (!nodeRef) {
    return (
      <span className="text-muted text-[var(--text-muted)] font-mono text-xs px-1">
        {shortLabel(id)}
      </span>
    );
  }

  const label =
    nodeRef.kind === 'symbol' && nodeRef.filePath
      ? `${nodeRef.filePath.split('/').pop()}#${nodeRef.name}`
      : nodeRef.name;

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(nodeRef.id)}
        className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-xs text-[var(--accent)] hover:border-[var(--accent)] mx-0.5 align-baseline"
      >
        {label}
      </button>
    );
  }

  const href = pid
    ? `/p/${pid}/explorer?node=${encodeURIComponent(nodeRef.id)}${nodeRef.startLine ? `&line=${nodeRef.startLine}` : ''}`
    : '#';

  return (
    <Link
      to={href}
      className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-xs text-[var(--accent)] hover:border-[var(--accent)] mx-0.5 align-baseline"
    >
      {label}
    </Link>
  );
}
