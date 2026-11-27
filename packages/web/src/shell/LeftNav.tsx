import { Link, NavLink, useSearchParams } from 'react-router';
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
import { t } from '@/i18n/t';
import { useAskStreaming } from '@/api/hooks/useAsk';

interface LeftNavProps {
  pid: string;
  highFlagCount?: number;
  providerLabel?: string;
}

export function LeftNav({ pid, highFlagCount = 0, providerLabel }: LeftNavProps) {
  const answering = useAskStreaming(pid);
  const [params] = useSearchParams();
  const lang = params.get('lang');
  const groups = [
    { title: t('workspace.explore'), items: [
      { path: 'overview', label: t('nav.overview'), icon: LayoutDashboard, key: 'o' },
      { path: 'features', label: t('nav.features'), icon: Layers, key: 'f' },
      { path: 'explorer', label: t('nav.explorer'), icon: FolderTree, key: 'e' },
      { path: 'graph', label: t('nav.graph'), icon: Share2, key: 'g' },
    ] },
    { title: t('workspace.review'), items: [
      { path: 'health', label: t('nav.health'), icon: Activity, key: 'h' },
      { path: 'impact', label: t('nav.impact'), icon: GitCompareArrows, key: '' },
      { path: 'ask', label: t('nav.ask'), icon: MessageSquareText, key: 'a' },
    ] },
  ];
  return (
    <aside className="workspace-rail" aria-label={t('shell.nav')}>
      <nav aria-label={t('shell.nav')}>
        {groups.map(({ title, items }) => (
          <div key={title} className="rail-group">
            <p aria-hidden="true" className="rail-heading">{title}</p>
            {items.map(({ path, label, icon: Icon, key }) => (
              <NavLink key={path} to={{ pathname: `/p/${pid}/${path}`, search: lang ? '?' + new URLSearchParams({ lang }) : '' }} aria-label={label}
                title={key ? `${label} (g ${key})` : label} className="rail-link">
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
                {path === 'ask' && answering && <small role="status" className="ml-auto text-[var(--rail-muted)]">{t('workspace.answering')}</small>}
                {path === 'health' && highFlagCount > 0 && (
                  <span className="rail-count" aria-label={t('shell.flags', { n: highFlagCount })}>{highFlagCount}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <Link to="/settings" state={{ projectId: pid }} className="rail-provider">
        <Settings size={16} aria-hidden="true" />
        <span>{t('workspace.provider')}<small>{providerLabel ?? t('shell.noProvider')}</small></span>
      </Link>
    </aside>
  );
}
