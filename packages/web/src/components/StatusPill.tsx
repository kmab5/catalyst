import { Link } from 'react-router';
import type { ProgressEvent, ProjectDTO } from '@/api/contract';
import { t } from '@/i18n/t';
import { cn } from '@/lib/cn';

interface StatusPillProps {
  project: ProjectDTO;
  progress?: ProgressEvent;
  onReindex?: () => void;
}

export function StatusPill({ project, progress, onReindex }: StatusPillProps) {
  if (project.status === 'indexing' || project.activeRunId) {
    const pct =
      progress && progress.total > 0
        ? Math.min(100, Math.round((progress.done / progress.total) * 100))
        : 0;
    return (
      <Link
        to={`/p/${project.id}/indexing`}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
        <span>{t('status.indexing', { pct })}</span>
      </Link>
    );
  }

  if (project.status === 'error') {
    return (
      <Link
        to={`/p/${project.id}/indexing`}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sev-high-soft)] px-2.5 py-1 text-xs font-medium text-[var(--sev-high)]"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--sev-high)]" />
        <span>{t('status.error')}</span>
      </Link>
    );
  }

  if (project.status === 'stale') {
    return (
      <button
        type="button"
        onClick={onReindex}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sev-warn-soft)] px-2.5 py-1 text-xs font-medium text-[var(--sev-warn)] hover:opacity-90"
        title="Code changed since last index — click to re-index"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--sev-warn)]" />
        <span>{t('status.stale')}</span>
      </button>
    );
  }

  if (project.status === 'never-indexed') {
    return (
      <Link
        to={`/p/${project.id}/indexing`}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--text-muted)]" />
        <span>{t('status.neverIndexed')}</span>
      </Link>
    );
  }

  if (project.aiStatus === 'skipped' || project.aiStatus === 'none') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]',
        )}
      >
        <span className="h-2 w-2 rounded-full border border-[var(--text-muted)]" />
        <span>{t('status.structureOnly')}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text)]">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <span>{t('status.ready')}</span>
    </span>
  );
}
