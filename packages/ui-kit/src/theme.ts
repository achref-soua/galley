/**
 * Theme metadata shared across Galley.
 *
 * The pure facts about the two shipped themes and the user-facing preference
 * set. The effectful controller that persists a choice and paints the document
 * lives in the desktop app; this module stays free of the DOM so it is trivial
 * to test and reuse.
 */

/** A concrete, resolved theme that maps to a `data-theme` value. */
export type Theme = 'onionskin' | 'carbon' | 'onionskin-hc' | 'carbon-hc';

/** A user preference; `system` defers to the OS colour scheme. */
export type ThemePreference = Theme | 'system';

/** The order the theme preferences appear in the switcher. */
export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'onionskin',
  'onionskin-hc',
  'carbon',
  'carbon-hc',
  'system'
];

/** In-voice labels for each preference. */
export const THEME_LABELS: Record<ThemePreference, string> = {
  onionskin: 'Onionskin',
  'onionskin-hc': 'Onionskin High-Contrast',
  carbon: 'Carbon',
  'carbon-hc': 'Carbon High-Contrast',
  system: 'Match system'
};

/** The concrete themes, in switcher order (excludes `system`). */
export const THEMES: readonly Theme[] = ['onionskin', 'onionskin-hc', 'carbon', 'carbon-hc'];

/** Type guard for a concrete theme. */
export function isTheme(value: unknown): value is Theme {
  return (
    value === 'onionskin' || value === 'carbon' || value === 'onionskin-hc' || value === 'carbon-hc'
  );
}

/** Whether a theme is a high-contrast accessibility variant. */
export function isHighContrast(theme: Theme): boolean {
  return theme === 'onionskin-hc' || theme === 'carbon-hc';
}

/** Type guard for a stored/loaded preference value. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return isTheme(value) || value === 'system';
}

/**
 * Resolve the active theme from a preference and the OS dark-mode flag.
 * `system` follows the OS; an explicit choice always wins.
 */
export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): Theme {
  if (pref === 'system') {
    return systemPrefersDark ? 'carbon' : 'onionskin';
  }
  return pref;
}
