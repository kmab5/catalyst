import { t } from '@/i18n/t';
export function PartialAiStrip({
  onContinue,
  disabled,
}: {
  onContinue: () => void;
  disabled: boolean;
}) {
  return (
    <div
      role="status"
      className="flex justify-center gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm"
    >
      {t('banner.partialAi')}
      <button
        disabled={disabled}
        onClick={onContinue}
        className="font-medium text-[var(--accent)] underline"
      >
        {t('banner.continue')}
      </button>
    </div>
  );
}
