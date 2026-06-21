import { describe, it, expect } from 'vitest';
import {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  interpolate,
  translate,
  I18n,
  type Messages
} from '../src/lib/i18n';
import { t, i18n } from '../src/lib/i18n-store';
import { en } from '../src/lib/locales/en';

describe('i18n — metadata', () => {
  it('ships English as the default locale', () => {
    expect(LOCALES).toEqual(['en']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('guards the locale tag', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(7)).toBe(false);
  });
});

describe('i18n — interpolate', () => {
  it('returns the template unchanged when there are no params', () => {
    expect(interpolate('plain text')).toBe('plain text');
  });

  it('substitutes known placeholders and leaves unknown ones intact', () => {
    expect(interpolate('Hi {name}, {count} left', { name: 'Ada', count: 3 })).toBe(
      'Hi Ada, 3 left'
    );
    expect(interpolate('keep {missing}', { other: 'x' })).toBe('keep {missing}');
  });
});

describe('i18n — translate', () => {
  const catalog: Messages = { 'a.greet': 'Hej {name}' };
  const fallback: Messages = { 'a.greet': 'Hi {name}', 'a.bye': 'Bye' };

  it('prefers the catalog, then the fallback, then the key', () => {
    expect(translate(catalog, fallback, 'a.greet', { name: 'Ada' })).toBe('Hej Ada');
    expect(translate(catalog, fallback, 'a.bye')).toBe('Bye');
    expect(translate(catalog, fallback, 'a.missing')).toBe('a.missing');
  });
});

describe('i18n — I18n', () => {
  it('translates against the active locale and switches locale', () => {
    const tr = new I18n({ en: { hello: 'Hello' } });
    expect(tr.locale).toBe('en');
    expect(tr.t('hello')).toBe('Hello');
    tr.setLocale('en');
    expect(tr.locale).toBe('en');
  });
});

describe('i18n — app store', () => {
  it('translates real catalog keys through the shared instance', () => {
    expect(i18n.locale).toBe('en');
    expect(t('app.name')).toBe(en['app.name']);
    expect(t('onboarding.import.title')).toBe(en['onboarding.import.title']);
  });
});
