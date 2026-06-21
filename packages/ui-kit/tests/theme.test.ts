import { describe, it, expect } from 'vitest';
import {
  THEME_PREFERENCES,
  THEME_LABELS,
  THEMES,
  isTheme,
  isHighContrast,
  isThemePreference,
  resolveTheme
} from '../src/theme';

describe('theme metadata', () => {
  it('lists the preferences in switcher order', () => {
    expect(THEME_PREFERENCES).toEqual([
      'onionskin',
      'onionskin-hc',
      'carbon',
      'carbon-hc',
      'system'
    ]);
  });

  it('lists the concrete themes (no system)', () => {
    expect(THEMES).toEqual(['onionskin', 'onionskin-hc', 'carbon', 'carbon-hc']);
  });

  it('labels every preference in voice', () => {
    expect(THEME_LABELS.onionskin).toBe('Onionskin');
    expect(THEME_LABELS['onionskin-hc']).toBe('Onionskin High-Contrast');
    expect(THEME_LABELS.carbon).toBe('Carbon');
    expect(THEME_LABELS['carbon-hc']).toBe('Carbon High-Contrast');
    expect(THEME_LABELS.system).toBe('Match system');
  });
});

describe('isTheme', () => {
  it('accepts every concrete theme', () => {
    expect(isTheme('onionskin')).toBe(true);
    expect(isTheme('carbon')).toBe(true);
    expect(isTheme('onionskin-hc')).toBe(true);
    expect(isTheme('carbon-hc')).toBe(true);
  });

  it('rejects system and anything else', () => {
    expect(isTheme('system')).toBe(false);
    expect(isTheme('sepia')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

describe('isHighContrast', () => {
  it('is true only for the high-contrast variants', () => {
    expect(isHighContrast('onionskin-hc')).toBe(true);
    expect(isHighContrast('carbon-hc')).toBe(true);
    expect(isHighContrast('onionskin')).toBe(false);
    expect(isHighContrast('carbon')).toBe(false);
  });
});

describe('isThemePreference', () => {
  it('accepts the themes and system', () => {
    expect(isThemePreference('onionskin')).toBe(true);
    expect(isThemePreference('carbon')).toBe(true);
    expect(isThemePreference('onionskin-hc')).toBe(true);
    expect(isThemePreference('carbon-hc')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isThemePreference('dark')).toBe(false);
    expect(isThemePreference(42)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('follows the OS when the preference is system', () => {
    expect(resolveTheme('system', true)).toBe('carbon');
    expect(resolveTheme('system', false)).toBe('onionskin');
  });

  it('honours an explicit preference regardless of the OS', () => {
    expect(resolveTheme('onionskin', true)).toBe('onionskin');
    expect(resolveTheme('carbon', false)).toBe('carbon');
    expect(resolveTheme('onionskin-hc', true)).toBe('onionskin-hc');
    expect(resolveTheme('carbon-hc', false)).toBe('carbon-hc');
  });
});
