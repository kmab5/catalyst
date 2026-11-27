import { Link } from 'react-router';
import { Search, Settings, ChevronDown } from 'lucide-react';
import { t } from '@/i18n/t';

interface TopBarProps {
  projectName?: string;
  onOpenPalette: () => void;
  statusSlot?: React.ReactNode;
  switcherSlot?: React.ReactNode;
}

export function TopBar({
  projectName,
  onOpenPalette,
  statusSlot,
  switcherSlot,
}: TopBarProps) {
  return (
    <header className="h-12 border-b border-[var(--border)] bg-[var(--surface)] px-4 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold text-sm tracking-tight text-[var(--text)] hover:opacity-80 shrink-0"
        >
          <span aria-hidden="true" className="text-[var(--accent)]">
            ◆
          </span>
          <span>{t('app.name')}</span>
        </Link>

        {switcherSlot ??
          (projectName ? (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--bg)] truncate max-w-[200px]"
            >
              <span className="truncate">{projectName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            </Link>
          ) : null)}
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex items-center gap-2 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--text-muted)] transition-colors text-left"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate flex-1">{t('topbar.searchPlaceholder')}</span>
        <kbd className="hidden sm:inline-block rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-mono">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-3 shrink-0">
        {statusSlot ?? (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>{t('status.ready')}</span>
          </span>
        )}
        <Link
          to="/settings"
          aria-label={t('nav.settings')}
          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
