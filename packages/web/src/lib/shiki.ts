import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import light from 'shiki/dist/themes/github-light.mjs';
import dark from 'shiki/dist/themes/github-dark.mjs';

const languages = {
  typescript: () => import('shiki/dist/langs/typescript.mjs'),
  tsx: () => import('shiki/dist/langs/tsx.mjs'),
  javascript: () => import('shiki/dist/langs/javascript.mjs'),
  jsx: () => import('shiki/dist/langs/jsx.mjs'),
  python: () => import('shiki/dist/langs/python.mjs'),
  go: () => import('shiki/dist/langs/go.mjs'),
  json: () => import('shiki/dist/langs/json.mjs'),
  prisma: () => import('shiki/dist/langs/prisma.mjs'),
};
let instance: ReturnType<typeof createHighlighterCore>;
async function load(language: string) {
  instance ??= createHighlighterCore({
    themes: [light, dark],
    langs: [],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
  const highlighter = await instance;
  const lang = Object.hasOwn(languages, language) ? (language as keyof typeof languages) : 'text';
  if (lang !== 'text' && !highlighter.getLoadedLanguages().includes(lang)) {
    await highlighter.loadLanguage((await languages[lang]()).default);
  }
  return { highlighter, lang };
}
export async function highlight(code: string, language: string, theme: 'light' | 'dark') {
  const { highlighter, lang } = await load(language);
  return highlighter.codeToHtml(code, { lang, theme: `github-${theme}` });
}
export async function highlightLines(code: string, language: string, theme: 'light' | 'dark') {
  const { highlighter, lang } = await load(language);
  return highlighter.codeToTokens(code, { lang, theme: `github-${theme}` }).tokens;
}
