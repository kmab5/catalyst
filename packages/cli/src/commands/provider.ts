import type { Engine } from '@catalyst/core';
import { ProviderType, type ProviderConfig } from '@catalyst/shared';
import type { CliDeps } from '../context.js';
import { CliError, EXIT } from '../exit-codes.js';

export async function providerCommand(engine: Engine, deps: CliDeps) {
  const prompt = deps.prompt;
  if (!prompt)
    throw new CliError(
      EXIT.BAD_ARGS,
      'Open Settings or use catalyst config set in a noninteractive shell.',
    );
  const current = engine.settings.get().provider;
  const detected = await engine.settings.detect();
  const choices = [
    ['openrouter', detected.env.OPENROUTER_API_KEY ? 'environment key detected' : ''],
    ['anthropic', detected.env.ANTHROPIC_API_KEY ? 'environment key detected' : ''],
    [
      'openai-compatible',
      detected.ollama.found
        ? 'Ollama detected'
        : detected.env.OPENAI_API_KEY
          ? 'environment key detected'
          : '',
    ],
    ['claude-code', detected.claudeCli.found ? 'Claude CLI detected' : ''],
  ];
  for (const [name, hint] of choices)
    deps.stderr.write('  ' + name + (hint ? ' (' + hint + ')' : '') + '\n');
  const selected =
    (await prompt('Provider [' + (current?.type ?? 'openrouter') + ']: ')).trim() ||
    current?.type ||
    'openrouter';
  const type = ProviderType.safeParse(selected);
  if (!type.success) throw new CliError(EXIT.BAD_ARGS, 'Choose a provider from the list.');

  let provider: ProviderConfig | undefined;
  if (
    current?.type !== type.data ||
    (current.apiKeySource === 'none' && (type.data === 'openrouter' || type.data === 'anthropic'))
  ) {
    switch (type.data) {
      case 'openrouter':
      case 'anthropic': {
        const apiKey = (await prompt('API key (hidden): ', true)).trim();
        if (!apiKey) throw new CliError(EXIT.BAD_ARGS, 'An API key is required for this provider.');
        provider =
          type.data === 'openrouter'
            ? { type: type.data, apiKey, baseUrl: 'https://openrouter.ai/api/v1' }
            : { type: type.data, apiKey };
        break;
      }
      case 'openai-compatible': {
        const baseUrl =
          (await prompt('Base URL [http://localhost:11434/v1]: ')).trim() ||
          'http://localhost:11434/v1';
        if (!URL.canParse(baseUrl) || !['http:', 'https:'].includes(new URL(baseUrl).protocol))
          throw new CliError(EXIT.BAD_ARGS, 'Enter an HTTP or HTTPS URL.');
        const apiKey = (await prompt('API key, if required (hidden): ', true)).trim();
        provider = { type: type.data, baseUrl, name: 'custom', ...(apiKey && { apiKey }) };
        break;
      }
      case 'claude-code':
        provider = { type: type.data, binary: 'claude' };
        break;
    }
  }
  // Test saved or environment credentials in place; never copy a masked or inferred key into storage.
  const result = await engine.settings.test(provider);
  if (!result.ok)
    throw new CliError(
      EXIT.PROVIDER,
      'Connection test failed. Check the provider configuration in Settings.',
    );
  if (provider) engine.settings.update({ provider });
  deps.stdout.write('Connected to ' + type.data + ' · ' + result.model + '\n');
  return EXIT.OK;
}
