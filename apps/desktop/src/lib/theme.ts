import { type Theme, type ThemePreference, isThemePreference, resolveTheme } from '@galley/ui-kit';

/**
 * The slice of the browser the theme controller touches. Injecting it keeps the
 * controller fully testable: pass a fake `Storage`, media query, and root
 * element in tests; pass the real `window`/`document` in the app.
 */
export interface ThemeEnv {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  /** Resolve the OS dark-mode media query (or `null` where unavailable). */
  matchDark(): { matches: boolean; addListener(fn: () => void): void } | null;
  /** The element whose `data-theme` attribute the app reads (usually <html>). */
  root: { setAttribute(name: string, value: string): void };
}

export const THEME_STORAGE_KEY = 'galley:theme';

/**
 * Wrap a `MediaQueryList` in the minimal shape `ThemeEnv` needs, normalising
 * the modern `addEventListener` form.
 */
export function mediaQueryEnv(mql: MediaQueryList): {
  matches: boolean;
  addListener(fn: () => void): void;
} {
  return {
    get matches() {
      return mql.matches;
    },
    addListener(fn: () => void) {
      mql.addEventListener('change', fn);
    }
  };
}

/** Build a `ThemeEnv` from the real browser globals. */
export function browserThemeEnv(): ThemeEnv {
  return {
    storage: window.localStorage,
    matchDark: () => mediaQueryEnv(window.matchMedia('(prefers-color-scheme: dark)')),
    root: document.documentElement
  };
}

/**
 * Reads/persists the user's theme preference, resolves it against the OS, paints
 * the document, and keeps following the OS while the preference is `system`.
 */
export class ThemeController {
  #env: ThemeEnv;
  #preference: ThemePreference;
  #resolved: Theme;
  #listeners = new Set<(theme: Theme) => void>();

  constructor(env: ThemeEnv) {
    this.#env = env;
    this.#preference = ThemeController.#load(env);
    this.#resolved = resolveTheme(this.#preference, this.#systemPrefersDark());
    this.#paint();
    const dark = env.matchDark();
    if (dark !== null) {
      dark.addListener(() => this.#onSystemChange());
    }
  }

  static #load(env: ThemeEnv): ThemePreference {
    const stored = env.storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  }

  #systemPrefersDark(): boolean {
    const dark = this.#env.matchDark();
    return dark === null ? false : dark.matches;
  }

  #paint(): void {
    this.#env.root.setAttribute('data-theme', this.#resolved);
  }

  #update(next: Theme): void {
    if (next === this.#resolved) {
      return;
    }
    this.#resolved = next;
    this.#paint();
    for (const listener of this.#listeners) {
      listener(next);
    }
  }

  #onSystemChange(): void {
    if (this.#preference === 'system') {
      this.#update(resolveTheme('system', this.#systemPrefersDark()));
    }
  }

  /** The current preference (`onionskin` | `carbon` | `system`). */
  get preference(): ThemePreference {
    return this.#preference;
  }

  /** The concrete theme currently painted. */
  get theme(): Theme {
    return this.#resolved;
  }

  /** Choose a preference: persist it, then repaint if the resolved theme moves. */
  setPreference(pref: ThemePreference): void {
    this.#preference = pref;
    this.#env.storage.setItem(THEME_STORAGE_KEY, pref);
    this.#update(resolveTheme(pref, this.#systemPrefersDark()));
  }

  /** Subscribe to resolved-theme changes; returns an unsubscribe function. */
  subscribe(listener: (theme: Theme) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
