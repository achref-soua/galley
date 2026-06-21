/**
 * Localization scaffolding (master plan §7, v0.7.2).
 *
 * A tiny, dependency-free message system: look up a dot-keyed message for the
 * active locale, fall back to English, and interpolate `{named}` parameters.
 * UI strings are externalised into per-locale catalogs so the interface can be
 * translated without touching components. Pure, so it tests to 100 %.
 */

/** A flat message catalog: dot-keyed id → template string. */
export type Messages = Record<string, string>;

/** A locale tag Galley ships strings for. */
export type Locale = 'en';

/** The locales Galley currently ships. */
export const LOCALES: readonly Locale[] = ['en'];

/** The default and fallback locale. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Type guard for a shipped locale tag. */
export function isLocale(value: unknown): value is Locale {
  return value === 'en';
}

/** Substitute `{name}` placeholders; an unknown placeholder is left intact. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = params[key];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Resolve `key` against `catalog`, then `fallback`, then the key itself, and
 * interpolate any parameters.
 */
export function translate(
  catalog: Messages,
  fallback: Messages,
  key: string,
  params?: Record<string, string | number>
): string {
  const template = catalog[key] ?? fallback[key] ?? key;
  return interpolate(template, params);
}

/** Holds the active locale and translates against its catalog. */
export class I18n {
  #locale: Locale;
  readonly #catalogs: Record<Locale, Messages>;

  constructor(catalogs: Record<Locale, Messages>, locale: Locale = DEFAULT_LOCALE) {
    this.#catalogs = catalogs;
    this.#locale = locale;
  }

  /** The active locale. */
  get locale(): Locale {
    return this.#locale;
  }

  /** Switch the active locale. */
  setLocale(locale: Locale): void {
    this.#locale = locale;
  }

  /** Translate `key` for the active locale, falling back to English. */
  t(key: string, params?: Record<string, string | number>): string {
    return translate(this.#catalogs[this.#locale], this.#catalogs[DEFAULT_LOCALE], key, params);
  }
}
