import { cn } from '@/lib/cn';

export function featureColor(colorIndex: number): string {
  const idx = ((colorIndex % 8) + 8) % 8;
  return `var(--feature-${idx})`;
}

export function FeatureDot({
  colorIndex,
  className,
  title,
}: {
  colorIndex: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-hidden="true"
      className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', className)}
      style={{ backgroundColor: featureColor(colorIndex) }}
    />
  );
}
