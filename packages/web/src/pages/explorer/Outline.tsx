import type { SourceDTO } from '@/api/contract';
import { t } from '@/i18n/t';

export function Outline({
  outline,
  selected,
  onSelect,
}: {
  outline: SourceDTO['outline'];
  selected: string;
  onSelect: (id: string, line: number) => void;
}) {
  if (!outline.length) return null;
  return (
    <nav className="outline-strip" aria-label={t('explorer.outline')}>
      <span>{t('explorer.outline')}</span>
      {outline.map((item) => (
        <button
          type="button"
          key={item.nodeId}
          title={item.symbolKind}
          aria-pressed={selected === item.nodeId}
          onClick={() => onSelect(item.nodeId, item.startLine)}
        >
          {item.name}
        </button>
      ))}
    </nav>
  );
}
