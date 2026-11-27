import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-[var(--surface-2)]',
        className,
      )}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="p-8 max-w-4xl space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-6 w-full max-w-2xl" />
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-5/6 max-w-xl" />
        <Skeleton className="h-4 w-4/6 max-w-xl" />
      </div>
      <div className="space-y-3 pt-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
