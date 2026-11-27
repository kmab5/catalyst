import { useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, FileCode2, Folder } from 'lucide-react';
import type { FeatureListItemDTO, TreeNodeDTO } from '@/api/contract';
import { FeatureDot } from '@/components/FeatureDot';
import { t } from '@/i18n/t';

interface TreeProps {
  tree: TreeNodeDTO;
  features: FeatureListItemDTO[];
  selectedPath?: string | null;
  onSelect: (id: string) => void;
}

function navigateTree(event: KeyboardEvent<HTMLElement>) {
  const container = event.currentTarget;
  const current = event.target;
  if (!(current instanceof HTMLButtonElement)) return;
  const buttons = Array.from(container.querySelectorAll('button'));
  const index = buttons.indexOf(current);
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const expanded = current.getAttribute('aria-expanded');
  if (
    (event.key === 'ArrowLeft' && expanded === 'true') ||
    (event.key === 'ArrowRight' && expanded === 'false')
  ) {
    current.click();
  } else if (event.key === 'ArrowLeft') {
    current.closest('li')?.parentElement?.closest('li')?.querySelector('button')?.focus();
  } else if (event.key === 'ArrowRight') {
    if (expanded === 'true') buttons[index + 1]?.focus();
  } else {
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : index + (event.key === 'ArrowDown' ? 1 : -1);
    buttons[next]?.focus();
  }
}

export function FileTree({ tree, features, selectedPath, onSelect }: TreeProps) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const byId = new Map(features.map((f) => [f.id, f]));
  function row(node: TreeNodeDTO, depth: number) {
    const directory = node.type === 'dir';
    const open = overrides[node.id] ?? Boolean(selectedPath?.startsWith(node.path + '/'));
    const Icon = directory ? (open ? ChevronDown : ChevronRight) : FileCode2;
    return (
      <li key={node.id}>
        <button
          type="button"
          aria-expanded={directory ? open : undefined}
          aria-label={node.name}
          aria-current={!directory && selectedPath === node.path ? 'true' : undefined}
          title={node.role ? `${node.path} · ${node.role}` : node.path}
          className="tree-row"
          style={{ paddingInlineStart: 12 + depth * 14 }}
          onClick={() =>
            directory ? setOverrides((old) => ({ ...old, [node.id]: !open })) : onSelect(node.id)
          }
        >
          <Icon size={14} aria-hidden="true" />
          <span className="truncate">{node.name}</span>
          <span className="ml-auto flex items-center gap-1">
            {node.featureIds.slice(0, 3).map((id) => {
              const feature = byId.get(id);
              return (
                feature && (
                  <FeatureDot
                    key={id}
                    colorIndex={feature.colorIndex}
                    title={feature.name}
                    className="h-1.5 w-1.5"
                  />
                )
              );
            })}
            {node.flagCount > 0 && (
              <span className="tree-flags" title={t('explorer.flagCount', { n: node.flagCount })}>
                {node.flagCount}
              </span>
            )}
          </span>
        </button>
        {directory && open && <ul>{node.children?.map((child) => row(child, depth + 1))}</ul>}
      </li>
    );
  }
  return (
    <nav aria-label={t('explorer.files')} onKeyDown={navigateTree} className="explorer-tree">
      <h2 className="explorer-bar">
        <Folder size={15} />
        {t('explorer.files')}
      </h2>
      <ul>{tree.children?.map((child) => row(child, 0))}</ul>
    </nav>
  );
}
