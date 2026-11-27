import { useState } from 'react';
import { Link } from 'react-router';
import { Search, Settings, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProjectDTO } from '@/api/contract';
import { useProjects } from '@/api/hooks/queries';
import { t } from '@/i18n/t';

function ProjectSwitcher({ project, onReindex }: { project: ProjectDTO; onReindex?: () => void }) {
  const projects = useProjects();
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative min-w-0"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          e.currentTarget.querySelector('button')?.focus();
        }
      }}
    >
      <button
        type="button"
        aria-label={t('shell.switch')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex max-w-48 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs"
      >
        <span className="truncate">{project.name}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <ul className="absolute left-0 top-full z-30 mt-1 w-72 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
          {(projects.data ?? [project]).map((p) => (
            <li key={p.id}>
              <Link
                onClick={() => setOpen(false)}
                to={`/p/${p.id}/${p.status === 'indexing' ? 'indexing' : 'overview'}`}
                className="block rounded p-2 text-xs hover:bg-[var(--surface-2)]"
              >
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${p.status === 'ready' ? 'bg-emerald-500' : p.status === 'error' ? 'bg-[var(--sev-high)]' : p.status === 'stale' ? 'bg-[var(--sev-warn)]' : 'bg-[var(--text-muted)]'}`}
                  />
                  {p.name}
                </span>
                <span className="ml-4 text-[var(--text-muted)]">
                  {p.lastIndexedAt
                    ? t('shell.lastIndexed', { date: new Date(p.lastIndexedAt).toLocaleString() })
                    : t('status.neverIndexed')}
                </span>
              </Link>
            </li>
          ))}
          {onReindex && (
            <li className="border-t border-[var(--border)]">
              <button
                type="button"
                className="block w-full rounded p-2 text-left text-xs hover:bg-[var(--surface-2)]"
                onClick={() => {
                  setOpen(false);
                  onReindex();
                }}
              >
                {t('shell.reindex')}
              </button>
            </li>
          )}
          <li className="border-t border-[var(--border)]">
            <Link
              onClick={() => setOpen(false)}
              to="/"
              className="block p-2 text-xs text-[var(--accent)]"
            >
              {t('topbar.openAnother')}
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}

export function TopBar({
  project,
  hasProject,
  onOpenPalette,
  statusSlot,
  onReindex,
}: {
  project?: ProjectDTO;
  hasProject: boolean;
  onReindex?: () => void;
  onOpenPalette: () => void;
  statusSlot?: ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span aria-hidden="true" className="text-[var(--accent)]">
            ◆
          </span>
          {t('app.name')}
        </Link>
        {project && <ProjectSwitcher project={project} onReindex={onReindex} />}
      </div>
      {hasProject && (
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex w-full max-w-md items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-left text-xs text-[var(--text-muted)] hover:border-[var(--text-muted)]"
        >
          <Search size={14} />
          <span className="flex-1 truncate">{t('topbar.searchPlaceholder')}</span>
          <kbd className="hidden rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
            ⌘K
          </kbd>
        </button>
      )}
      <div className="flex shrink-0 items-center gap-3">
        {statusSlot}
        <Link
          to="/settings"
          aria-label={t('nav.settings')}
          className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
        >
          <Settings size={16} />
        </Link>
      </div>
    </header>
  );
}
