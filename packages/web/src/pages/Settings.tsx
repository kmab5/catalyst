import { Link, useLocation } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import {
  useProvidersDetect,
  useSettings,
  useTestProvider,
  useUpdateSettings,
} from '@/api/hooks/queries';
import { GROQ_MODELS, ProviderConfig, type Lang, type ProviderType, type SettingsUpdate } from '@/api/contract';
import { PageSkeleton } from '@/components/Skeleton';
import { ProviderDisclosure } from '@/components/ProviderDisclosure';
import { ErrorCard } from '@/components/ErrorCard';
import { t } from '@/i18n/t';
import { cn } from '@/lib/cn';

const MODEL_SUGGESTIONS: Record<ProviderType, { fast: string; smart: string }> = {
  groq: GROQ_MODELS,
  openrouter: { fast: 'openrouter/free', smart: 'openrouter/free' },
  anthropic: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' },
  'openai-compatible': { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
  'claude-code': { fast: 'haiku', smart: 'sonnet' },
};

function isLocalhostUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      ['http:', 'https:'].includes(protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    );
  } catch {
    return false;
  }
}

export function Settings() {
  const { data: settings, isLoading, error, refetch } = useSettings();
  const { data: detected } = useProvidersDetect();
  const origin: unknown = useLocation().state?.projectId;
  const [changedLanguage, setChangedLanguage] = useState<Lang>();
  const updateMut = useUpdateSettings();
  const testMut = useTestProvider();

  const [providerType, setProviderType] = useState<ProviderType | 'none'>('openrouter');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const keyInput = useRef<HTMLInputElement>(null);
  const [removeKey, setRemoveKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [binary, setBinary] = useState('claude');
  const [fastModel, setFastModel] = useState('');
  const [smartModel, setSmartModel] = useState('');
  const [outputLanguage, setOutputLanguage] = useState<Lang>('en');
  const [budgetUsd, setBudgetUsd] = useState('');
  const [concurrency, setConcurrency] = useState(6);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    const saved =
      typeof localStorage !== 'undefined' ? localStorage.getItem('catalyst.theme') : null;
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  const [providerDirty, setProviderDirty] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setProviderType(settings.provider?.type ?? 'none');
    setBaseUrl(
      settings.provider?.baseUrl ??
        (settings.provider?.type === 'openai-compatible'
          ? 'http://localhost:11434/v1'
          : 'https://openrouter.ai/api/v1'),
    );
    setBinary(settings.provider?.binary ?? 'claude');
    setFastModel(settings.models.fast);
    setSmartModel(settings.models.smart);
    setOutputLanguage(settings.outputLanguage);
    setBudgetUsd(settings.budgetUsd !== null ? String(settings.budgetUsd) : '');
    setConcurrency(settings.concurrency);
    setApiKeyInput('');
    setProviderDirty(false);
    setRemoveKey(false);
  }, [settings]);

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('catalyst.theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('catalyst.theme', theme);
    }
  }, [theme]);

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="p-8 max-w-2xl">
        <ErrorCard error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  function buildProviderConfig(): SettingsUpdate['provider'] {
    if (providerType === 'none') return null;
    if (providerType === 'claude-code') {
      return { type: 'claude-code', binary: binary || 'claude' };
    }
    const key = removeKey
      ? { apiKey: null }
      : apiKeyInput.trim()
        ? { apiKey: apiKeyInput.trim() }
        : {};
    if (providerType === 'openai-compatible') {
      return {
        type: 'openai-compatible',
        baseUrl: baseUrl || 'http://localhost:11434/v1',
        name: isLocalhostUrl(baseUrl) ? 'ollama' : 'custom',
        ...key,
      };
    }
    if (providerType === 'anthropic' || providerType === 'groq') {
      return { type: providerType, ...key };
    }
    return {
      type: 'openrouter',
      ...key,
      baseUrl: baseUrl || 'https://openrouter.ai/api/v1',
    };
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSavedNotice(false);

    const payload: SettingsUpdate = {
      models: { fast: fastModel.trim(), smart: smartModel.trim() },
      outputLanguage,
      budgetUsd: budgetUsd.trim() ? Number(budgetUsd) : null,
      concurrency,
    };

    if (providerDirty || apiKeyInput.trim()) {
      const built = buildProviderConfig();
      if (built !== undefined) {
        payload.provider = built;
      }
    }

    updateMut.mutate(payload, {
      onSuccess: () => {
        setApiKeyInput('');
        setRemoveKey(false);
        setProviderDirty(false);
        if (outputLanguage !== settings?.outputLanguage) setChangedLanguage(outputLanguage);
        setSavedNotice(true);
      },
    });
  }

  const showKeyField =
    providerType === 'groq' ||
    providerType === 'openrouter' ||
    providerType === 'anthropic' ||
    providerType === 'openai-compatible';

  const maskedKey =
    providerType === settings?.provider?.type ? settings?.provider?.apiKeyMasked : null;
  const keyRequired = !maskedKey && (providerType === 'openrouter' || providerType === 'anthropic' || (providerType === 'groq' && !detected?.env.GROQ_API_KEY));
  const testingDraft = providerDirty || Boolean(apiKeyInput.trim());
  const testConfig = testingDraft ? ProviderConfig.safeParse(buildProviderConfig()) : undefined;
  const canTestDraft =
    !testingDraft ||
    (testConfig?.success &&
      !removeKey &&
      !(maskedKey && !apiKeyInput.trim() && providerType === 'openai-compatible'));
  const providerOptions: { id: ProviderType; title: string; subtitle: string; badge?: string }[] = [
    ...(detected?.claudeCli.found
      ? [
          {
            id: 'claude-code' as const,
            title: t('settings.claudeDetected', {
              version: detected.claudeCli.version ? ' v' + detected.claudeCli.version : '',
            }),
            subtitle: t('settings.claudePlan'),
          },
        ]
      : []),
    {
      id: 'openrouter',
      title: 'OpenRouter',
      subtitle: t('settings.routerHelp'),
      badge: t('settings.recommended'),
    },
    { id: 'groq', title: 'Groq', subtitle: t('settings.groqHelp') },
    {
      id: 'anthropic',
      title: 'Anthropic',
      subtitle: t('settings.anthropicHelp'),
    },
    {
      id: 'openai-compatible',
      title: 'OpenAI-compatible / Ollama',
      subtitle: t('settings.compatibleHelp'),
      badge:
        providerType === 'openai-compatible' && isLocalhostUrl(baseUrl)
          ? t('settings.local')
          : undefined,
    },
    ...(!detected?.claudeCli.found
      ? [
          {
            id: 'claude-code' as const,
            title: 'Claude Code CLI',
            subtitle: t('settings.claudeHelp'),
          },
        ]
      : []),
  ];

  return (
    <div data-testid="page-settings" className="mx-auto max-w-2xl px-6 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('settings.intro')}</p>
      </header>

      {changedLanguage && typeof origin === 'string' && settings?.provider && (
        <Link
          className="inline-block text-sm text-[var(--accent)] underline"
          to={`/p/${encodeURIComponent(origin)}/indexing`}
          state={{ reviewExisting: true, language: changedLanguage }}
        >
          {t('settings.regenerate', { language: changedLanguage === 'tr' ? 'Türkçe' : 'English' })}
        </Link>
      )}
      {updateMut.error && <ErrorCard error={updateMut.error} />}
      {testMut.error && <ErrorCard error={testMut.error} />}
      <form onChange={() => setSavedNotice(false)} onSubmit={handleSave} className="space-y-8">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t('settings.provider')}</h2>
            {settings?.provider && (
              <button
                type="button"
                onClick={() => {
                  setProviderType('none');
                  setProviderDirty(true);
                }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline"
              >
                {t('settings.disconnect')}
              </button>
            )}
          </div>

          <div className="grid gap-2">
            {providerOptions.map((opt) => (
              <label
                key={opt.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                  providerType === opt.id
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]',
                )}
              >
                <input
                  type="radio"
                  name="providerType"
                  value={opt.id}
                  checked={providerType === opt.id}
                  onChange={() => {
                    setProviderType(opt.id);
                    setApiKeyInput('');
                    setRemoveKey(false);
                    setProviderDirty(true);
                    const def = MODEL_SUGGESTIONS[opt.id];
                    setFastModel(def.fast);
                    setSmartModel(def.smart);
                    if (opt.id === 'openrouter') setBaseUrl('https://openrouter.ai/api/v1');
                    if (opt.id === 'openai-compatible' && !isLocalhostUrl(baseUrl)) {
                      setBaseUrl('http://localhost:11434/v1');
                    }
                  }}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{opt.title}</span>
                    {opt.badge && (
                      <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{opt.subtitle}</p>
                </div>
              </label>
            ))}
          </div>

          {showKeyField && (
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              {providerType === 'openai-compatible' && (
                <div>
                  <label className="block text-xs font-medium mb-1">
                    {t('settings.baseUrl')}
                    <input
                      type="url"
                      required
                      value={baseUrl}
                      onChange={(e) => {
                        setBaseUrl(e.target.value);
                        setProviderDirty(true);
                      }}
                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-mono text-xs"
                    />
                  </label>
                  {detected?.ollama.found && detected.ollama.models.length > 0 && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {t('settings.modelChoices', { models: detected.ollama.models.join(', ') })}
                    </p>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="api-key-input" className="text-xs font-medium">
                    {t('settings.apiKey')}
                  </label>
                  {maskedKey && (
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      {settings?.provider?.apiKeySource === 'env'
                        ? t('settings.envKey', {
                            variable:
                              providerType === 'anthropic'
                                ? 'ANTHROPIC_API_KEY'
                                : providerType === 'openrouter'
                                  ? 'OPENROUTER_API_KEY'
                                  : providerType === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY',
                            masked: maskedKey,
                          })
                        : t('settings.masked', { masked: maskedKey })}
                    </span>
                  )}
                </div>
                <input
                  ref={keyInput}
                  id="api-key-input"
                  aria-label={t('settings.apiKey')}
                  type="password"
                  required={keyRequired}
                  autoComplete="new-password"
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    setRemoveKey(false);
                  }}
                  placeholder={maskedKey ? t('settings.keep') : 'sk-...'}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-mono text-xs"
                />
                {maskedKey && (
                  <div className="mt-2 flex gap-3 text-xs text-[var(--accent)]">
                    <button
                      type="button"
                      onClick={() => {
                        setRemoveKey(false);
                        keyInput.current?.focus();
                      }}
                    >
                      {t('settings.replace')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRemoveKey(!removeKey);
                        setApiKeyInput('');
                        setProviderDirty(true);
                      }}
                    >
                      {removeKey ? t('settings.undoRemove') : t('settings.removeKey')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => testMut.mutate(testConfig?.success ? testConfig.data : undefined)}
              disabled={testMut.isPending || !canTestDraft || providerType === 'none'}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
            >
              {testMut.isPending ? t('settings.testing') : t('settings.testConnection')}
            </button>
            {testMut.data && (
              <span
                className={cn(
                  'text-xs',
                  testMut.data.ok ? 'text-emerald-600' : 'text-[var(--sev-high)]',
                )}
              >
                {testMut.data.ok
                  ? t('settings.connected', {
                      ms: testMut.data.latencyMs,
                      model: testMut.data.model,
                    })
                  : (testMut.data.message ?? t('settings.failed'))}
              </span>
            )}
          </div>
        </section>

        <datalist id="model-suggestions">
          {[
            ...new Set([
              ...(providerType === 'none' ? [] : Object.values(MODEL_SUGGESTIONS[providerType])),
              ...(providerType === 'openai-compatible' ? (detected?.ollama.models ?? []) : []),
            ]),
          ].map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        <section className="grid sm:grid-cols-2 gap-4">
          <label className="block text-xs font-medium">
            {t('settings.fast')}
            <input
              type="text"
              list="model-suggestions"
              required
              value={fastModel}
              onChange={(e) => setFastModel(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs"
            />
          </label>
          <label className="block text-xs font-medium">
            {t('settings.smart')}
            <input
              type="text"
              list="model-suggestions"
              required
              value={smartModel}
              onChange={(e) => setSmartModel(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs"
            />
          </label>
        </section>

        <section className="grid sm:grid-cols-3 gap-4">
          <label className="block text-xs font-medium">
            {t('settings.language')}
            <select
              value={outputLanguage}
              onChange={(e) => setOutputLanguage(e.target.value as Lang)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs"
            >
              <option value="en">English</option>
              <option value="tr">Türkçe</option>
            </select>
          </label>

          <label className="block text-xs font-medium">
            {t('settings.budget')}
            <input
              type="number"
              step="any"
              min="0.000001"
              placeholder={t('settings.uncapped')}
              value={budgetUsd}
              onChange={(e) => setBudgetUsd(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs"
            />
          </label>

          <label className="block text-xs font-medium">
            {t('settings.concurrency')}
            <input
              type="number"
              min={1}
              max={32}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value) || 6)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs"
            />
          </label>
        </section>

        <section className="space-y-2">
          <span className="block text-xs font-medium">{t('settings.appearance')}</span>
          <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
            {(['system', 'light', 'dark'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTheme(mode)}
                className={cn(
                  'rounded px-3 py-1 text-xs capitalize',
                  theme === mode
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                    : 'text-[var(--text-muted)]',
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs text-[var(--text-muted)]">
          {settings?.provider && <><ProviderDisclosure provider={settings.provider} />{' '}</>}
          {t('settings.privacy')}{' '}
          <a
            href="https://github.com/kmab5/catalyst/blob/main/plan/docs/12-config-and-privacy.md"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] underline"
          >
            {t('settings.policy')}
          </a>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updateMut.isPending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {updateMut.isPending ? t('settings.saving') : t('common.save')}
          </button>
          {savedNotice && <span className="text-xs text-emerald-600">{t('settings.saved')}</span>}
        </div>
      </form>
    </div>
  );
}
