/** The product name, mirrored from `galley_core::NAME`. */
export const NAME = 'Galley';

/** The product tagline. */
export const TAGLINE = 'Pull a proof.';

/** A user's theme preference; `system` follows the OS setting. */
export type ThemePreference = 'onionskin' | 'carbon' | 'system';

/** A concrete, resolved theme. */
export type Theme = 'onionskin' | 'carbon';

/**
 * Resolve the active theme from the user's preference and the OS dark-mode flag.
 * The full design-system themes land in v0.0.2; this is the seed of that logic.
 */
export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): Theme {
  if (pref === 'system') {
    return systemPrefersDark ? 'carbon' : 'onionskin';
  }
  return pref;
}

/** The window/title-bar string, e.g. `"Galley 0.0.1"`. */
export function windowTitle(version: string): string {
  return `${NAME} ${version}`;
}
