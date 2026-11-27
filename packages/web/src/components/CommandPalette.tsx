import { Fragment, useEffect, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { Search, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useFind, useSearch } from '@/api/hooks/queries';
import { t } from '@/i18n/t';
import { ErrorCard } from './ErrorCard';

function HighlightName({ text, ranges }: { text: string; ranges: [number, number][] }) {
  let position = 0;
  const parts = ranges.map(([start, end]) => {
    const prefix = text.slice(position, start);
    position = end;
    return (
      <Fragment key={start}>
        {prefix}
        <mark>{text.slice(start, end)}</mark>
      </Fragment>
    );
  });
  return (
    <>
      {parts}
      {text.slice(position)}
    </>
  );
}

function HighlightSnippet({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(«[^»]*»)/g)
        .map((part, i) =>
          part.startsWith('«') && part.endsWith('»') ? (
            <mark key={i}>{part.slice(1, -1)}</mark>
          ) : (
            part
          ),
        )}
    </>
  );
}

const item =
  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-[var(--accent-soft)] data-[selected=true]:text-[var(--accent)]';
const group =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--text-muted)]';

export function CommandPalette({
  pid,
  initialQuery,
  onClose,
}: {
  pid: string;
  initialQuery: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [selection, setSelection] = useState('');
  const navigate = useNavigate();
  const manualSelection = useRef(false);
  const trimmed = query.trim();
  const askFirst = /\s|\?$/.test(trimmed);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(trimmed), 120);
    return () => window.clearTimeout(timeout);
  }, [trimmed]);
  const find = useFind(pid, debounced, { limit: 7 });
  const search = useSearch(pid, debounced, { limit: 7 });
  const current = trimmed.length > 0 && trimmed === debounced;
  const findRows = current ? (find.data ?? []) : [];
  const searchRows = current ? (search.data ?? []) : [];
  const firstFind = findRows[0]?.node.id;
  useEffect(() => {
    if (!trimmed || manualSelection.current) return;
    setSelection(askFirst || !firstFind ? 'ask' : 'find:' + firstFind);
  }, [trimmed, askFirst, firstFind]);
  const nodes = new Map([
    ...findRows.map((row) => ['find:' + row.node.id, row.node.id] as const),
    ...searchRows.map((row) => ['search:' + row.node.id, row.node.id] as const),
  ]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };
  const askRow = trimmed && (
    <Command.Item
      value="ask"
      className={item}
      onSelect={() => go(`/p/${pid}/ask?q=${encodeURIComponent(trimmed)}`)}
    >
      {t('palette.ask', { q: trimmed })}
    </Command.Item>
  );
  return (
    <Command.Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      label={t('topbar.searchPlaceholder')}
      shouldFilter={false}
      vimBindings={false}
      loop
      value={selection}
      onValueChange={setSelection}
      overlayClassName="fixed inset-0 z-40 bg-black/30"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(42rem,94vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-xl"
      onPointerMove={() => {
        manualSelection.current = true;
      }}
      onKeyDownCapture={(e) => {
        if (['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(e.key)) manualSelection.current = true;
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && nodes.has(selection)) {
          e.preventDefault();
          e.stopPropagation();
          go(`/p/${pid}/graph?focus=${encodeURIComponent(nodes.get(selection)!)}`);
        }
      }}
    >
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <Search size={17} aria-hidden="true" className="text-[var(--text-muted)]" />
        <Command.Input
          autoFocus
          aria-label={t('topbar.searchPlaceholder')}
          placeholder={t('topbar.searchPlaceholder')}
          value={query}
          onValueChange={(value) => {
            manualSelection.current = false;
            setQuery(value);
          }}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none"
        />
        <button type="button" onClick={onClose} aria-label={t('palette.close')}>
          <X size={16} />
        </button>
      </div>
      <Command.List className="max-h-[55vh] overflow-y-auto p-2">
        {askFirst && askRow}
        {findRows.length > 0 && (
          <Command.Group heading={t('palette.find')} className={group}>
            {findRows.map(({ node, matchRanges, context }) => (
              <Command.Item
                key={node.id}
                value={'find:' + node.id}
                className={item}
                onSelect={() => go(`/p/${pid}/explorer?node=${encodeURIComponent(node.id)}`)}
              >
                <span className="w-12 shrink-0 text-xs text-[var(--text-muted)]">{node.kind}</span>
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">
                    <HighlightName text={node.name} ranges={matchRanges} />
                  </div>
                  {context && context !== node.name && (
                    <div className="truncate text-xs text-[var(--text-muted)]">{context}</div>
                  )}
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {!askFirst && askRow}
        {searchRows.length > 0 && (
          <Command.Group heading={t('palette.search')} className={group}>
            {searchRows.map(({ node, snippet }) => (
              <Command.Item
                key={node.id}
                value={'search:' + node.id}
                className={item}
                onSelect={() => go(`/p/${pid}/explorer?node=${encodeURIComponent(node.id)}`)}
              >
                <span className="w-12 shrink-0 text-xs text-[var(--text-muted)]">{node.kind}</span>
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">{node.name}</div>
                  <div className="truncate text-xs text-[var(--text-muted)]">
                    <HighlightSnippet text={snippet} />
                  </div>
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {current && (find.error || search.error) && (
          <ErrorCard
            error={find.error ?? search.error}
            onRetry={() => {
              void find.refetch();
              void search.refetch();
            }}
          />
        )}
        {current &&
          find.isSuccess &&
          search.isSuccess &&
          !findRows.length &&
          !searchRows.length && <p className="px-3 py-2 text-sm">{t('palette.noMatches')}</p>}
        <Command.Group heading={t('palette.go')} className={group}>
          {(['features', 'health', 'settings'] as const)
            .filter(
              (page) => !trimmed || t(`nav.${page}`).toLowerCase().includes(trimmed.toLowerCase()),
            )
            .map((page) => (
              <Command.Item
                key={page}
                value={'go:' + page}
                className={item}
                onSelect={() => go(page === 'settings' ? '/settings' : `/p/${pid}/${page}`)}
              >
                {t(`nav.${page}`)}
              </Command.Item>
            ))}
        </Command.Group>
      </Command.List>
      <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]">
        {t('palette.keyboard')}
      </div>
    </Command.Dialog>
  );
}
