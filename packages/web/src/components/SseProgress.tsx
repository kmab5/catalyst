import { Check, Loader2, Circle, AlertCircle } from 'lucide-react';
import type { ProgressEvent } from '@/api/contract';
import { cn } from '@/lib/cn';

interface StageGroup {
  key: string;
  label: string;
  tooltip: string;
  stages: ProgressEvent['stage'][];
}

const GROUPS: StageGroup[] = [
  { key: 'scan', label: 'Scanning files', tooltip: 'scan', stages: ['scan'] },
  { key: 'parse', label: 'Parsing code', tooltip: 'parse', stages: ['parse'] },
  { key: 'resolve', label: 'Linking imports', tooltip: 'resolve · graph', stages: ['resolve', 'graph'] },
  { key: 'detect', label: 'Detecting frameworks', tooltip: 'detect', stages: ['detect'] },
  { key: 'health', label: 'Checking structure', tooltip: 'health', stages: ['health'] },
  { key: 'summarize', label: 'Explaining each file', tooltip: 'summarize', stages: ['summarize'] },
  { key: 'features', label: 'Grouping into features', tooltip: 'rollup · features', stages: ['rollup', 'features'] },
  { key: 'overview', label: 'Writing the overview', tooltip: 'overview · changeability · fts', stages: ['overview', 'changeability', 'fts'] },
];

export function SseProgress({
  events,
  stackNames = [],
  includeAi = true,
}: {
  events: ProgressEvent[];
  stackNames?: string[];
  includeAi?: boolean;
}) {
  const latestByGroup = new Map<string, ProgressEvent>();
  let activeGroupIndex = -1;
  let isDone = false;
  let isError = false;

  for (const ev of events) {
    if (ev.stage === 'done') {
      isDone = true;
      continue;
    }
    if (ev.stage === 'error') {
      isError = true;
      continue;
    }
    const idx = GROUPS.findIndex((g) => g.stages.includes(ev.stage));
    if (idx >= 0) {
      const grp = GROUPS[idx]!;
      latestByGroup.set(grp.key, ev);
      if (idx > activeGroupIndex) activeGroupIndex = idx;
    }
  }

  const visibleGroups = includeAi
    ? GROUPS
    : GROUPS.slice(0, 5);

  return (
    <div className="space-y-2.5">
      {visibleGroups.map((grp, idx) => {
        const ev = latestByGroup.get(grp.key);
        const completed = isDone || idx < activeGroupIndex;
        const active = !isDone && idx === activeGroupIndex;
        const pct =
          ev && ev.total > 0 ? Math.min(100, Math.round((ev.done / ev.total) * 100)) : 0;

        return (
          <div
            key={grp.key}
            title={`Engine stage: ${grp.tooltip}`}
            className={cn(
              'flex items-center justify-between gap-4 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm',
              !completed && !active && 'opacity-55',
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {completed ? (
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : active ? (
                isError ? (
                  <AlertCircle className="h-4 w-4 text-[var(--sev-high)] shrink-0" />
                ) : (
                  <Loader2 className="h-4 w-4 text-[var(--accent)] animate-spin shrink-0" />
                )
              ) : (
                <Circle className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              )}
              <span className="font-medium text-[var(--text)]">{grp.label}</span>
              {grp.key === 'detect' && stackNames.length > 0 && (
                <span className="text-xs text-[var(--text-muted)] truncate">
                  {stackNames.join(' · ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] font-mono shrink-0">
              {ev?.message && <span>{ev.message}</span>}
              {!ev?.message && ev && ev.total > 0 && (
                <span>
                  {ev.done}/{ev.total}
                </span>
              )}
              {active && ev && ev.total > 1 && (
                <div className="w-20 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              {ev?.tokens && (
                <span>
                  {Math.round(ev.tokens.in / 1000)}k / {Math.round(ev.tokens.out / 1000)}k tok
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
