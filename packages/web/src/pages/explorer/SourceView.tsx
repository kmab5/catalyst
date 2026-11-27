import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileCode2 } from 'lucide-react';
import type { ThemedToken } from 'shiki/core';
import { ids, type XRayDTO } from '@/api/contract';
import { useSource } from '@/api/hooks/queries';
import { ErrorCard } from '@/components/ErrorCard';
import { PageSkeleton } from '@/components/Skeleton';
import { t } from '@/i18n/t';
import { useColorScheme } from '@/lib/useColorScheme';
import { Outline } from './Outline';

const WINDOW = 2000;

export function SourceView({
  pid,
  xray,
  line,
  onSelect,
  onInspect,
}: {
  pid: string;
  xray: XRayDTO;
  line?: number;
  onSelect: (id: string, line?: number) => void;
  onInspect: () => void;
}) {
  const { node } = xray;
  const fileId = node.filePath ? ids.file(node.filePath) : undefined;
  const anchor = line ?? node.startLine ?? 1;
  const start = Math.floor((anchor - 1) / WINDOW) * WINDOW + 1;
  const { data, error, refetch } = useSource(pid, fileId, { start, end: start + WINDOW - 1 });
  const theme = useColorScheme();
  const [styled, setStyled] = useState<{
    source: typeof data;
    theme: typeof theme;
    lines: ThemedToken[][];
  }>();
  const scrollBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!data) return;
    let active = true;
    import('@/lib/shiki')
      .then((m) => m.highlightLines(data.text, data.language, theme))
      .then((lines) => {
        if (active) setStyled({ source: data, theme, lines });
      })
      .catch(() => {
        /* Source stays readable if a grammar fails to load. */
      });
    return () => {
      active = false;
    };
  }, [data, theme]);
  useEffect(() => {
    if (data && anchor)
      scrollBox.current
        ?.querySelector(`[data-line="${anchor}"]`)
        ?.scrollIntoView?.({ block: 'nearest' });
  }, [data, anchor]);
  if (error) return <ErrorCard error={error} onRetry={() => void refetch()} />;
  if (!fileId) return <p className="explorer-message">{t('explorer.noSource')}</p>;
  if (!data) return <PageSkeleton />;
  const sourceLines = data.text.split(/\r?\n/);
  const tokens = styled && styled.source === data && styled.theme === theme ? styled.lines : undefined;
  const selected = data.outline.find((item) => item.nodeId === node.id);
  const outline = data.outline;
  const file = fileId;
  function chooseLine(number: number) {
    const symbol = outline.reduce<(typeof outline)[number] | undefined>((nearest, item) => {
      if (number < item.startLine || number > item.endLine) return nearest;
      if (!nearest || item.endLine - item.startLine < nearest.endLine - nearest.startLine) return item;
      return nearest;
    }, undefined);
    onSelect(symbol?.nodeId ?? file, number);
  }
  const numbered = (index: number) => {
    const number = data.startLine + index;
    const active =
      number === line || (selected && number >= selected.startLine && number <= selected.endLine);
    return (
      <div
        data-line={number}
        className={active ? 'source-line line-highlight' : 'source-line'}
        key={number}
      >
        <button
          type="button"
          aria-label={t('explorer.jump', { line: number })}
          tabIndex={number === Math.max(data.startLine, Math.min(anchor, data.endLine)) ? 0 : -1}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
            if (step) {
              e.preventDefault();
              scrollBox.current
                ?.querySelector<HTMLButtonElement>(`[data-line="${number + step}"] button`)
                ?.focus();
            }
          }}
          onClick={() => chooseLine(number)}
        >
          {number}
        </button>
        <code>
          {tokens?.[index]?.map((token, key) => (
            <span key={key} style={{ color: token.color }}>
              {token.content}
            </span>
          )) ?? sourceLines[index]}
        </code>
      </div>
    );
  };
  return (
    <section className="source-view">
      <header className="explorer-bar">
        <FileCode2 size={15} />
        <h2 className="truncate font-mono">{data.filePath}</h2>
        <button type="button" className="xray-open ml-auto" onClick={onInspect}>
          {t('explorer.panel')}
        </button>
      </header>
      <Outline outline={data.outline} selected={node.id} onSelect={onSelect} />
      <div className="source-lines" ref={scrollBox}>
        {sourceLines.map((_, index) => numbered(index))}
      </div>
      {data.totalLines > WINDOW && (
        <footer className="source-pager">
          <button
            type="button"
            aria-label={t('explorer.previous')}
            disabled={data.startLine <= 1}
            onClick={() => onSelect(fileId, Math.max(1, start - WINDOW))}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {t('explorer.lines', { start: data.startLine, end: data.endLine, total: data.totalLines })}
          </span>
          <button
            type="button"
            aria-label={t('explorer.next')}
            disabled={data.endLine >= data.totalLines}
            onClick={() => onSelect(fileId, data.endLine + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </footer>
      )}
    </section>
  );
}
