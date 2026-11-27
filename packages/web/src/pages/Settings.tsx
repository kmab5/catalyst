import { useEffect, useState } from 'react';
import {
  useProvidersDetect,
  useSettings,
  useTestProvider,
  useUpdateSettings,
} from '@/api/hooks/queries';
import type { Lang, ProviderConfig, ProviderType, SettingsUpdate } from '@/api/contract';
import { PageSkeleton } from '@/components/Skeleton';
import { ErrorCard } from '@/components/ErrorCard';
import { t } from '@/i18n/t';
import { cn } from '@/lib/cn';

const MODEL_SUGGESTIONS: Record<ProviderType, { fast: string; smart: string }> = {
  openrouter: { fast: 'anthropic/claude-haiku-5.5', smart: 'anthropic/claude-sonnet-5.5' },
  anthropic: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' },
  'openai-compatible': { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
  'claude-code': { fast: 'haiku', smart: 'sonnet' },
};

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(url.trim());
}

export function Settings() {
  const { data: settings, isLoading, error, refetch } = useSettings();
  const { data: detected } = useProvidersDetect();
  const updateMut = useUpdateSettings();
  const testMut = useTestProvider();

  const [providerType, setProviderType] = useState<ProviderType | 'none'>('openrouter');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [binary, setBinary] = useState('claude');
  const [fastModel, setFastModel] = useState('');
  const [smartModel, setSmartModel] = useState('');
  const [outputLanguage, setOutputLanguage] = useState<Lang>('en');
  const [budgetUsd, setBudgetUsd] = useState('');
  const [concurrency, setConcurrency] = useState(6);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('catalyst.theme') : null;
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

  function buildProviderConfig(): ProviderConfig | null | undefined {
    if (providerType === 'none') return null;
    if (providerType === 'claude-code') {
      return { type: 'claude-code', binary: binary || 'claude' };
    }
    if (providerType === 'openai-compatible') {
      return {
        type: 'openai-compatible',
        baseUrl: baseUrl || 'http://localhost:11434/v1',
        name: isLocalhostUrl(baseUrl) ? 'ollama' : 'custom',
        ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
      };
    }
    if (providerType === 'anthropic') {
      if (!apiKeyInput.trim()) return undefined;
      return { type: 'anthropic', apiKey: apiKeyInput.trim() };
    }
    if (!apiKeyInput.trim()) return undefined;
    return {
      type: 'openrouter',
      apiKey: apiKeyInput.trim(),
      baseUrl: baseUrl || 'https://openrouter.ai/api/v1',
    };
  }

  async function handleSave(e: React.FormEvent) {
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

    await updateMut.mutateAsync(payload);
    setApiKeyInput('');
    setProviderDirty(false);
    setSavedNotice(true);
  }

  const showKeyField =
    providerType === 'openrouter' ||
    providerType === 'anthropic' ||
    providerType === 'openai-compatible';

  const providerOptions: { id: ProviderType; title: string; subtitle: string; badge?: string }[] = [
    ...(detected?.claudeCli.found
      ? [
          {
            id: 'claude-code' as const,
            title: `Claude Code CLI (detected${detected.claudeCli.version ? ` v${detected.claudeCli.version}` : ''})`,
            subtitle: 'Billed to your Claude plan, no API key needed.',
          },
        ]
      : []),
    {
      id: 'openrouter',
      title: 'OpenRouter',
      subtitle: 'Recommended — one key covers Anthropic, OpenAI, and open models.',
      badge: 'Recommended',
    },
    {
      id: 'anthropic',
      title: 'Anthropic',
      subtitle: 'Direct Anthropic API key.',
    },
    {
      id: 'openai-compatible',
      title: 'OpenAI-compatible / Ollama',
      subtitle: 'OpenAI, Groq, Together, Ollama, or LM Studio.',
      badge:
        providerType === 'openai-compatible' && isLocalhostUrl(baseUrl)
          ? 'Fully local'
          : undefined,
    },
    ...(!detected?.claudeCli.found
      ? [
          {
            id: 'claude-code' as const,
            title: 'Claude Code CLI',
            subtitle: 'Uses local `claude` CLI binary.',
          },
        ]
      : []),
  ];

  return (
    <div data-testid="page-settings" className="mx-auto max-w-2xl px-6 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Configure which AI provider writes plain-English summaries, features, and Ask answers.
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-8">
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
                Disconnect (structure only)
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
                    Base URL
                    <input
                      type="text"
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
                      Detected Ollama models: {detected.ollama.models.join(', ')}
                    </p>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="api-key-input" className="text-xs font-medium">
                    API key
                  </label>
                  {settings?.provider?.apiKeyMasked && (
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      Saved: {settings.provider.apiKeyMasked}
                      {settings.provider.apiKeySource === 'env' ? ' (from env)' : ''}
                    </span>
                  )}
                </div>
                <input
                  id="api-key-input"
                  aria-label="API key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    settings?.provider?.apiKeyMasked
                      ? 'Leave blank to keep existing key'
                      : 'sk-...'
                  }
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-mono text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const p = providerDirty || apiKeyInput.trim() ? buildProviderConfig() : undefined;
                testMut.mutate(p ?? undefined);
              }}
              disabled={testMut.isPending}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
            >
              {testMut.isPending ? 'Testing…' : t('settings.testConnection')}
            </button>
            {testMut.data && (
              <span
                className={cn(
                  'text-xs',
                  testMut.data.ok ? 'text-emerald-600' : 'text-[var(--sev-high)]',
                )}
              >
                {testMut.data.ok
                  ? `Connected · ${testMut.data.latencyMs} ms · ${testMut.data.model}`
                  : testMut.data.message ?? 'Connection failed'}
              </span>
            )}
          </div>
        </section>

        <section className="grid sm:grid-cols-2 gap-4">
          <label className="block text-xs font-medium">
            Fast model (summaries)
            <input
              type="text"
              value={fastModel}
              onChange={(e) => setFastModel(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs"
            />
          </label>
          <label className="block text-xs font-medium">
            Smart model (features, overview, Ask)
            <input
              type="text"
              value={smartModel}
              onChange={(e) => setSmartModel(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs"
            />
          </label>
        </section>

        <section className="grid sm:grid-cols-3 gap-4">
          <label className="block text-xs font-medium">
            AI output language
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
            Budget cap (USD per run)
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="No cap"
              value={budgetUsd}
              onChange={(e) => setBudgetUsd(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs"
            />
          </label>

          <label className="block text-xs font-medium">
            Concurrency (1–32)
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
          <span className="block text-xs font-medium">Appearance</span>
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
          {t('settings.privacy')}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updateMut.isPending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {updateMut.isPending ? 'Saving…' : t('common.save')}
          </button>
          {savedNotice && <span className="text-xs text-emerald-600">Settings saved.</span>}
        </div>
      </form>
    </div>
  );
}
