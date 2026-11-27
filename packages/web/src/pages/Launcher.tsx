import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Folder, ArrowLeft, ArrowRight, FolderGit2 } from 'lucide-react';
import { api } from '@/api/client';
import { ApiError } from '@/api/errors';
import { useBrowse, useProjects } from '@/api/hooks/queries';
import { t } from '@/i18n/t';
import { cn } from '@/lib/cn';

function relativeTime(ms: number | null): string {
  if (!ms) return t('launcher.never');
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('launcher.now');
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_DOT: Record<string, string> = {
  ready: 'bg-emerald-500',
  indexing: 'bg-[var(--accent)] animate-pulse',
  stale: 'bg-[var(--sev-warn)]',
  error: 'bg-[var(--sev-high)]',
  'never-indexed': 'bg-[var(--text-muted)]',
};

export function Launcher() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const suggest = searchParams.get('suggest') ?? '';

  const [folderPath, setFolderPath] = useState(suggest);
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);
  const browseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(browseTimer.current), []);
  const [opening, setOpening] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (suggest) setFolderPath(suggest);
  }, [suggest]);

  const { data: browseData } = useBrowse(browsePath);
  const { data: projects = [] } = useProjects();

  async function openProjectPath(targetPath: string) {
    const trimmed = targetPath.trim();
    if (!trimmed) return;
    setOpening(true);
    setErrorMsg(null);
    try {
      const proj = await api.projects.open(trimmed);
      if (proj.status === 'stale' && proj.lastRunId) {
        navigate(`/p/${proj.id}/indexing`, { state: { reviewExisting: true } });
      } else if (proj.status === 'never-indexed' || proj.status === 'stale') {
        const { runId } = await api.index.start(proj.id, { ai: false });
        navigate(`/p/${proj.id}/indexing`, { state: { runId, reviewEstimate: true } });
      } else if (proj.status === 'indexing') {
        navigate(`/p/${proj.id}/indexing`);
      } else {
        navigate(`/p/${proj.id}/overview`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PATH_NOT_FOUND') {
        setErrorMsg(t('launcher.missing'));
      } else {
        setErrorMsg(err instanceof Error ? err.message : t('launcher.failed'));
      }
    } finally {
      setOpening(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void openProjectPath(folderPath);
  }

  return (
    <div data-testid="page-launcher" className="mx-auto max-w-2xl px-6 py-12 space-y-10">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="text-[var(--accent)]" aria-hidden="true">
            ◆
          </span>
          <span>{t('app.name')}</span>
        </div>
        <p className="text-base text-[var(--text-muted)]">{t('app.tagline')}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--text)]">{t('launcher.openFolder')}</h2>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            aria-label={t('launcher.folderLabel')}
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder={t('launcher.example')}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={opening || !folderPath.trim()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {opening ? t('launcher.opening') : t('launcher.open')}
          </button>
        </form>
        {errorMsg && (
          <p role="alert" className="text-xs text-[var(--sev-high)]">
            {errorMsg}
          </p>
        )}

        {browseData && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs">
              <div className="flex items-center gap-2 font-mono text-[var(--text-muted)] truncate">
                {browseData.parent && (
                  <button
                    type="button"
                    onClick={() => setBrowsePath(browseData.parent!)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--surface)] text-[var(--text)]"
                    title={t('launcher.parent')}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className="truncate">{browseData.path}</span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">{t('launcher.browse')}</span>
            </div>
            <ul className="divide-y divide-[var(--border)] max-h-56 overflow-y-auto">
              {browseData.entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={(event) => {
                      clearTimeout(browseTimer.current);
                      setFolderPath(entry.path);
                      if (event.detail === 0) setBrowsePath(entry.path);
                      else if (event.detail === 1) {
                        // Keep the row mounted until a potential second click opens it.
                        browseTimer.current = setTimeout(() => setBrowsePath(entry.path), 500);
                      }
                    }}
                    onDoubleClick={() => {
                      clearTimeout(browseTimer.current);
                      void openProjectPath(entry.path);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {entry.isProject ? (
                        <FolderGit2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
                      ) : (
                        <Folder className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                      )}
                      <span className="font-mono text-xs truncate">{entry.name}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] shrink-0">
                      {entry.isProject && (
                        <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
                          {t('launcher.projectBadge')}
                        </span>
                      )}
                      {entry.hasIndex && (
                        <span className="rounded bg-[var(--accent-soft)] text-[var(--accent)] px-1.5 py-0.5">
                          {t('launcher.indexedBadge')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {browseData.entries.length === 0 && (
                <li className="px-3 py-4 text-xs text-[var(--text-muted)] text-center">
                  {t('launcher.empty')}
                </li>
              )}
            </ul>
          </div>
        )}
      </section>

      {projects.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-[var(--text)]">{t('launcher.recent')}</h2>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={opening}
                onClick={() => void openProjectPath(p.root)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-[var(--surface-2)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        STATUS_DOT[p.status] ?? 'bg-[var(--text-muted)]',
                      )}
                    />
                    <span className="font-medium text-sm text-[var(--text)] truncate">
                      {p.name}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{p.status}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-[var(--text-muted)] truncate">
                    {p.root}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] shrink-0">
                  <span>{relativeTime(p.lastIndexedAt)}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
