import { Lang, ProviderType, type SettingsDTO, type SettingsUpdate } from '@catalyst/shared';
import { CliError, EXIT } from './exit-codes.js';

const openRouterUrl = 'https://openrouter.ai/api/v1';
const compatibleUrl = 'http://localhost:11434/v1';
function invalid(message: string): never {
  throw new CliError(EXIT.BAD_ARGS, message);
}

export function configGet(key: string, current: SettingsDTO): string {
  const provider = current.provider;
  switch (key) {
    case 'provider.type':
      return provider?.type ?? 'none';
    case 'provider.apiKey':
      return provider?.apiKeyMasked ?? 'none';
    case 'provider.binary':
      return provider?.binary ?? 'none';
    case 'provider.baseUrl':
      return provider?.baseUrl ?? 'none';
    case 'models.fast':
      return current.models.fast;
    case 'models.smart':
      return current.models.smart;
    case 'budgetUsd':
      return String(current.budgetUsd);
    case 'outputLanguage':
      return current.outputLanguage;
    case 'concurrency':
      return String(current.concurrency);
    case 'telemetry':
      return 'false';
    default:
      return invalid('Unknown config key.');
  }
}

export function configSetToUpdate(key: string, raw: string, current: SettingsDTO): SettingsUpdate {
  const value = raw.trim();
  const provider = current.provider;
  switch (key) {
    case 'models.fast':
    case 'models.smart':
      if (!value) return invalid('Enter a model name.');
      return { models: { [key.slice(7)]: value } };
    case 'outputLanguage': {
      const parsed = Lang.safeParse(value);
      if (!parsed.success) return invalid('Choose en or tr.');
      return { outputLanguage: parsed.data };
    }
    case 'budgetUsd': {
      if (value === 'null') return { budgetUsd: null };
      const n = Number(value);
      if (!value || !Number.isFinite(n) || n <= 0)
        return invalid('Enter a positive budget or null.');
      return { budgetUsd: n };
    }
    case 'concurrency': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 32)
        return invalid('Choose a concurrency between 1 and 32.');
      return { concurrency: n };
    }
    case 'provider.type': {
      if (value === 'none' || value === 'null') return { provider: null };
      const type = ProviderType.safeParse(value);
      if (!type.success) return invalid('Unknown provider type.');
      if (type.data === provider?.type) return { provider: { type: type.data } };
      // Keyed providers can be selected first, then configured with a separate command.
      switch (type.data) {
        case 'openrouter':
          return { provider: { type: type.data, baseUrl: openRouterUrl, apiKey: '' } };
        case 'groq':
        case 'anthropic':
          return { provider: { type: type.data, apiKey: '' } };
        case 'openai-compatible':
          return { provider: { type: type.data, baseUrl: compatibleUrl } };
        case 'claude-code':
          return { provider: { type: type.data, binary: 'claude' } };
      }
      break;
    }
    case 'provider.apiKey': {
      if (!provider || provider.type === 'claude-code')
        return invalid('Select a provider that uses an API key first.');
      const apiKey = value || null;
      if (provider.type === 'anthropic' || provider.type === 'groq') return { provider: { type: provider.type, apiKey } };
      return {
        provider: {
          type: provider.type,
          apiKey,
          baseUrl:
            provider.baseUrl ?? (provider.type === 'openrouter' ? openRouterUrl : compatibleUrl),
        },
      };
    }
    case 'provider.baseUrl':
      if (!provider || (provider.type !== 'openrouter' && provider.type !== 'openai-compatible'))
        return invalid('Select an OpenRouter or OpenAI-compatible provider first.');
      if (!URL.canParse(value) || !['http:', 'https:'].includes(new URL(value).protocol))
        return invalid('Enter an HTTP or HTTPS URL.');
      return { provider: { type: provider.type, baseUrl: value } };
    case 'provider.binary':
      if (provider?.type !== 'claude-code' || !value)
        return invalid('Choose Claude Code and enter a binary path.');
      return { provider: { type: 'claude-code', binary: value } };
  }
  return invalid('Unknown config key.');
}
