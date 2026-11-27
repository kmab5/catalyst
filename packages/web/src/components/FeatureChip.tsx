import { Link, useParams } from 'react-router';
import { FeatureDot } from './FeatureDot';
import { cn } from '@/lib/cn';

interface FeatureChipProps {
  featureId: string;
  name: string;
  colorIndex: number;
  role?: string;
  className?: string;
}

export function FeatureChip({
  featureId,
  name,
  colorIndex,
  role,
  className,
}: FeatureChipProps) {
  const { pid } = useParams<{ pid: string }>();
  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-medium text-[var(--text)]',
        pid && 'hover:border-[var(--text-muted)] transition-colors',
        className,
      )}
    >
      <FeatureDot colorIndex={colorIndex} />
      <span>{name}</span>
      {role && <span className="text-[var(--text-muted)] font-normal">· {role}</span>}
    </span>
  );

  if (!pid) return content;
  return <Link to={`/p/${pid}/features/${encodeURIComponent(featureId)}`}>{content}</Link>;
}
