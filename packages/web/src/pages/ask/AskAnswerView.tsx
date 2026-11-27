import type { AskAnswer } from '@/api/contract';
import { Markdown } from '@/components/Markdown';
import { NodeLink } from '@/components/NodeLink';
import { t } from '@/i18n/t';
import { Check } from 'lucide-react';

export function AskAnswerView({
  answer,
  onSource,
}: {
  answer: AskAnswer;
  onSource: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Markdown text={answer.markdown} citations={answer.citations} onSelectCitation={onSource} />
      {!answer.found && (
        <section className="space-y-2 rounded-md border-l-2 border-[var(--text-muted)] bg-[var(--surface-2)] p-4 text-sm">
          <h3 className="font-semibold">{t('ask.notFoundTitle')}</h3>
          <ul aria-label={t('ask.checked')} className="space-y-2">
            {answer.searched.map((s, i) => (
              <li key={i} className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
          <p className="text-[var(--text-muted)]">{t('ask.try')}</p>
        </section>
      )}
      {answer.citations.length > 0 && (
        <footer>
          <h3 className="mb-1 text-xs font-semibold text-[var(--text-muted)]">
            {t('ask.sources')}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {answer.citations.map((node) => (
              <li key={node.id}>
                <NodeLink
                  node={node}
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                      e.preventDefault();
                      onSource(node.id);
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        </footer>
      )}
    </div>
  );
}
