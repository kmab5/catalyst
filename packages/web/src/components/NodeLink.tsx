import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  FileCode2,
  Folder,
  FunctionSquare,
  Globe,
  Database,
  KeyRound,
  Package,
  Cloud,
  Layers,
} from 'lucide-react';
import type { NodeKind, NodeRef } from '@/api/contract';
import { useNode } from '@/api/hooks/queries';
import { cn } from '@/lib/cn';

const KIND_ICON: Record<NodeKind, React.ComponentType<{ className?: string }>> = {
  directory: Folder,
  file: FileCode2,
  symbol: FunctionSquare,
  route: Globe,
  db_model: Database,
  env_var: KeyRound,
  package: Package,
  service: Cloud,
  feature: Layers,
};

interface NodeLinkProps {
  node: NodeRef;
  showPath?: boolean;
  showKind?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function NodeLink({
  node,
  showPath = false,
  showKind = false,
  onClick,
  className,
}: NodeLinkProps) {
  const { pid } = useParams<{ pid: string }>();
  const [hovered, setHovered] = useState(false);
  const { data: xray } = useNode(hovered ? pid : undefined, hovered ? node.id : undefined);

  const Icon = KIND_ICON[node.kind] ?? FileCode2;
  const href = pid
    ? node.kind === 'feature'
      ? `/p/${pid}/features/${encodeURIComponent(node.id)}`
      : `/p/${pid}/explorer?node=${encodeURIComponent(node.id)}${node.startLine ? `&line=${node.startLine}` : ''}`
    : '#';

  const summaryText =
    xray?.symbolPurpose ?? xray?.summary?.purpose ?? null;

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        to={href}
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-xs text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors',
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
        <span className="truncate">{node.name}</span>
        {showKind && (
          <span className="font-sans text-[10px] text-[var(--text-muted)]">
            {node.kind}
          </span>
        )}
        {showPath && node.filePath && node.filePath !== node.name && (
          <span className="text-[11px] text-[var(--text-muted)] truncate">
            {node.filePath}
            {node.startLine ? `:${node.startLine}` : ''}
          </span>
        )}
      </Link>

      {hovered && xray && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 shadow-md text-left"
        >
          <div className="font-mono text-xs font-medium text-[var(--text)] truncate">
            {node.id}
          </div>
          {summaryText && (
            <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-3 font-sans">
              {summaryText}
            </p>
          )}
          {xray.features.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {xray.features.slice(0, 3).map((f) => (
                <span
                  key={f.id}
                  className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-sans text-[var(--text-muted)]"
                >
                  {f.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
