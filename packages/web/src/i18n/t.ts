import { en, type I18nKey } from './en';
import { tr } from './tr';

let currentLocale: 'en' | 'tr' = 'en';

export function setLocale(locale: 'en' | 'tr'): void {
  currentLocale = locale;
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  const dict = currentLocale === 'tr' ? tr : en;
  let template: string = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      template = template.replaceAll(`{${k}}`, String(v));
    }
  }
  return template;
}
