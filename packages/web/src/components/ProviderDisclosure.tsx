import type { SettingsDTO } from '@/api/contract';
import { t } from '@/i18n/t';

const names = {
  openrouter: 'OpenRouter',
  groq: 'Groq',
  anthropic: 'Anthropic',
  'claude-code': 'Claude Code',
  'openai-compatible': 'OpenAI-compatible',
};

export function ProviderDisclosure({ provider }: { provider: NonNullable<SettingsDTO['provider']> }) {
  let name = names[provider.type];
  if (provider.type === 'openai-compatible' && provider.baseUrl) {
    const host = URL.canParse(provider.baseUrl) ? new URL(provider.baseUrl).host : '';
    if (host) name += ' (' + host + ')';
  }
  return <span>{t('provider.disclosure', { provider: name })}</span>;
}
