import { parseFile } from './adapter.js';
import type { LanguageAdapter } from './types.js';
export const ADAPTER_VERSION = 2;
export const tsAdapter: LanguageAdapter = {
  languages: ['typescript', 'tsx', 'javascript', 'jsx'],
  parse: (input) => parseFile(input),
};
