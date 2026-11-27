import {parseFile} from './adapter.js';
import type {LanguageAdapter} from './types.js';
export const pyAdapter:LanguageAdapter={languages:['python'],parse:input=>parseFile(input,true)};
