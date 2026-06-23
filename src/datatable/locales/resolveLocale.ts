/**
 * Resolve the effective set of UI strings for a DataTable instance.
 *
 * Precedence (lowest to highest): English base pack, the matched locale pack,
 * then per-key `lang` overrides. When no locale is given (or `'auto'`), the
 * browser language is detected; an explicit locale pins the language and skips
 * detection entirely.
 */

import type { DataTableLangOptions } from '../../types/datatable-options';
import { enLocale } from './en';
import { getLocalePack } from './index';

export interface ResolveLocaleOptions {
  /** Explicit locale code, or `'auto'`/omitted to detect from the browser. */
  locale?: string;
  /** Per-key string overrides that win over the resolved locale pack. */
  langOverrides?: Partial<DataTableLangOptions>;
}

export function resolveLocale(opts: ResolveLocaleOptions = {}): Required<DataTableLangOptions> {
  const target = opts.locale && opts.locale !== 'auto'
    ? opts.locale
    : detectBrowserLocale();
  const pack = target ? getLocalePack(target) : undefined;
  return {
    ...enLocale,
    ...(pack ?? {}),
    ...(opts.langOverrides ?? {}),
  };
}

/**
 * Pick the best-matching registered locale from the browser's language
 * preferences. Tries each candidate as an exact match, then by its primary
 * subtag (`pt-BR` → `pt`), and falls back to English. Safe outside a browser.
 */
function detectBrowserLocale(): string {
  if (typeof navigator === 'undefined') return 'en';

  const candidates: string[] = [];
  if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
  if (navigator.language) candidates.push(navigator.language);

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (getLocalePack(candidate)) return candidate;
    const primary = candidate.split('-')[0];
    if (primary !== candidate && getLocalePack(primary)) return primary;
  }
  return 'en';
}
