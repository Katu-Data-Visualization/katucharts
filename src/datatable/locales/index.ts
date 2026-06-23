/**
 * Built-in locale registry and lookup for the DataTable.
 *
 * Ships English (base), Brazilian Portuguese, Spanish and Simplified Chinese.
 * `registerLocale` lets callers add or override packs for additional languages.
 */

import type { DataTableLangOptions } from '../../types/datatable-options';
import { enLocale } from './en';
import { ptBRLocale } from './pt-BR';
import { esLocale } from './es';
import { zhLocale } from './zh';

const LOCALE_REGISTRY: Record<string, Partial<DataTableLangOptions>> = {
  en: enLocale,
  'pt-BR': ptBRLocale,
  pt: ptBRLocale,
  es: esLocale,
  zh: zhLocale,
};

/**
 * Register (or replace) a locale pack so it can be selected via the `locale`
 * option or matched during auto-detection.
 *
 * @param code  BCP 47 language tag, e.g. `'fr'` or `'de-DE'`.
 * @param pack  Strings for that locale; omitted keys fall back to English.
 */
export function registerLocale(code: string, pack: Partial<DataTableLangOptions>): void {
  LOCALE_REGISTRY[code] = pack;
}

/** Return the registered pack for a locale code, or `undefined` when unknown. */
export function getLocalePack(code: string): Partial<DataTableLangOptions> | undefined {
  return LOCALE_REGISTRY[code];
}

export { enLocale, ptBRLocale, esLocale, zhLocale };
