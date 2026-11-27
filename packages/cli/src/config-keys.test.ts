import { expect, test } from 'vitest';
import { sampleSettingsDTO } from '@catalyst/shared';
import { configSetToUpdate } from './config-keys.js';

const current = {
  ...sampleSettingsDTO,
  provider: {
    ...sampleSettingsDTO.provider!,
    type: 'openrouter' as const,
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyMasked: 'masked',
  },
};
test('provider updates never write the masked value', () => {
  expect(configSetToUpdate('provider.apiKey', 'sk-test', current)).toEqual({
    provider: { type: 'openrouter', baseUrl: current.provider.baseUrl, apiKey: 'sk-test' },
  });
  expect(configSetToUpdate('provider.baseUrl', 'https://example.org/v1', current)).toEqual({
    provider: { type: 'openrouter', baseUrl: 'https://example.org/v1' },
  });
});
test.each([
  ['nonexistent', 'x'],
  ['concurrency', '1.5'],
  ['budgetUsd', '-1'],
  ['outputLanguage', 'xx'],
  ['provider.baseUrl', 'file:///tmp'],
])('invalid %s exits 2', (key, value) => {
  expect(() => configSetToUpdate(key, value, current)).toThrow(
    expect.objectContaining({ exitCode: 2 }),
  );
});
