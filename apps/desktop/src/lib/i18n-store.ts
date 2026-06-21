/**
 * The app-wide translator. Components import {@link t} to render externalised
 * strings; the active locale defaults to English. Other locales register their
 * catalog here as they are added.
 */
import { I18n, DEFAULT_LOCALE, type Locale, type Messages } from './i18n';
import { en } from './locales/en';

/** Every shipped catalog, keyed by locale. */
export const catalogs: Record<Locale, Messages> = { en };

/** The single translator instance shared across the app. */
export const i18n = new I18n(catalogs, DEFAULT_LOCALE);

/** Translate `key` with the app-wide translator (falls back to English). */
export function t(key: string, params?: Record<string, string | number>): string {
  return i18n.t(key, params);
}
