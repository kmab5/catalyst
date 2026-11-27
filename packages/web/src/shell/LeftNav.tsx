import { NavLink } from 'react-router';
import {
  LayoutDashboard,
  Layers,
  FolderTree,
  Share2,
  Activity,
  MessageSquareText,
  GitCompareArrows,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n/t';

interface LeftNavProps {
  pid: string;
  highFlagCount?: number;
  providerLabel?: string;
}

export function LeftNav({ pid, highFlagCount = 0, providerLabel }: LeftNavProps) {
  const items = [
    { to: `/p/${pid}/overview`, label: t('nav.overview'), icon: LayoutDashboard, shortcut: 'g o' },
    { to: `/p/${pid}/features`, label: t('nav.features'), icon: Layers, shortcut: 'g f' },
    { to: `/p/${pid}/explorer`, label: t('nav.explorer'), icon: FolderTree, shortcut: 'g e' },
    { to: `/p/${pid}/graph`, label: t('nav.graph'), icon: Share2, shortcut: 'g g' },
    {
      to: `/p/${pid}/health`,
      label: t('nav.health'),
      icon: Activity,
      shortcut: 'g h',
      badge: highFlagCount > 0 ? highFlagCount : undefined,
    },
    { to: `/p/${pid}/ask`, label: t('nav.ask'), icon: MessageSquareText, shortcut: 'g a' },
    { to: `/p/${pid}/impact`, label: t('nav.impact'), icon: GitCompareArrows },
  ];

  return (
    <aside
      aria-label={t('shell.nav')}
      className="flex flex-col justify-between border-r border-[var(--border)] bg-[var(--surface)] w-14 min-[1100px]:w-52 shrink-0 py-3 px-2 select-none transition-[width] duration-150"
    >
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden min-[1100px]:inline truncate">{item.label}</span>
              {item.badge !== undefined && (
                <span
                  aria-label={t('shell.flags', { n: item.badge })}
                  className="hidden min-[1100px]:inline-flex ml-auto items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-medium bg-[var(--sev-high-soft)] text-[var(--sev-high)]"
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] pt-3 px-1">
        <NavLink
          to="/settings"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          title={providerLabel ?? t('nav.settings')}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden min-[1100px]:inline truncate">
            {t('shell.provider', { provider: providerLabel ?? t('shell.noProvider') })}
          </span>
        </NavLink>
      </div>
    </aside>
  );
}
