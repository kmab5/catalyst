import type { AskEvent } from '@/api/contract';
import { t } from '@/i18n/t';

export function AskTrace({ events, streaming }: { events: AskEvent[]; streaming: boolean }) {
  if (!events.length) return null;
  return (
    <details
      key={streaming ? 'live' : 'finished'}
      open={streaming}
      className="my-3 rounded-md bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]"
    >
      <summary className="cursor-pointer font-medium">
        {t('ask.trace', { n: events.length })}
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {events.map((event, i) => (
          <li key={i}>
            {event.type === 'thinking'
              ? event.text
              : event.type === 'tool'
                ? event.resultSummary || event.name
                : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
