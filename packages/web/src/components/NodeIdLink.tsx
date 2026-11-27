import { Link, useParams } from 'react-router';
import { ids, type NodeRef } from '@/api/contract';
import { NodeLink } from './NodeLink';

/** Some DTOs carry a validated ID without a display-ready NodeRef. */
export function NodeIdLink({
  id,
  node,
  showPath = false,
}: {
  id: string;
  node?: NodeRef;
  showPath?: boolean;
}) {
  const { pid } = useParams();
  if (node) return <NodeLink node={node} showPath={showPath} />;
  const parsed = ids.parse(id);
  const name = parsed.method
    ? `${parsed.method} ${parsed.path}`
    : (parsed.name ?? parsed.path ?? id);
  const href =
    parsed.kind === 'feature'
      ? `/p/${pid}/features/${encodeURIComponent(id)}`
      : `/p/${pid}/explorer?node=${encodeURIComponent(id)}`;
  return (
    <Link className="break-all font-mono text-xs text-[var(--accent)] hover:underline" to={href}>
      {name}
    </Link>
  );
}
