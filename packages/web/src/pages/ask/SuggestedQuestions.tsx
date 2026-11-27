import { useHealth, useOverview } from '@/api/hooks/queries';
import { t } from '@/i18n/t';

export function SuggestedQuestions({ pid, onAsk }: { pid: string; onAsk: (q: string) => void }) {
  const data = useOverview(pid).data;
  const hub = useHealth(pid).data?.metrics.topFanIn[0]?.node;
  const payments = data?.features.some((f) => f.category === 'payments');
  const questions = [
    data?.features.some((f) => f.category === 'auth')
      ? t('ask.login')
      : data?.features[0]
        ? t('ask.feature', { name: data.features[0].name })
        : t('ask.login'),
    payments
      ? t('ask.payments')
      : data?.stack[0]
        ? t('ask.stack', { name: data.stack[0].name })
        : null,
    t('ask.routes'),
    t('ask.password'),
    hub ? t('ask.hub', { hub: hub.filePath ?? hub.name }) : null,
  ];
  return (
    <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {questions.map(
        (q) =>
          q && (
            <li key={q}>
              <button
                type="button"
                onClick={() => onAsk(q)}
                className="w-full rounded px-2 py-3 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                {q}
              </button>
            </li>
          ),
      )}
    </ul>
  );
}
