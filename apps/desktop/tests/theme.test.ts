import { describe, it, expect, vi } from 'vitest';
import {
  ThemeController,
  browserThemeEnv,
  mediaQueryEnv,
  THEME_STORAGE_KEY,
  type ThemeEnv
} from '../src/lib/theme';

interface Harness {
  env: ThemeEnv;
  root: { attrs: Record<string, string>; setAttribute(n: string, v: string): void };
  store: Map<string, string>;
  setDark(value: boolean): void;
  fireDark(): void;
}

function makeEnv(opts: { stored?: string; dark?: boolean; noMedia?: boolean } = {}): Harness {
  const store = new Map<string, string>();
  if (opts.stored !== undefined) {
    store.set(THEME_STORAGE_KEY, opts.stored);
  }
  let darkMatches = opts.dark ?? false;
  const listeners: (() => void)[] = [];
  const root = {
    attrs: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    }
  };
  const env: ThemeEnv = {
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value)
    },
    matchDark: opts.noMedia
      ? () => null
      : () => ({
          get matches() {
            return darkMatches;
          },
          addListener: (fn: () => void) => void listeners.push(fn)
        }),
    root
  };
  return {
    env,
    root,
    store,
    setDark: (value) => (darkMatches = value),
    fireDark: () => listeners.forEach((fn) => fn())
  };
}

describe('ThemeController construction', () => {
  it('defaults to system → onionskin and paints the document', () => {
    const h = makeEnv();
    const c = new ThemeController(h.env);
    expect(c.preference).toBe('system');
    expect(c.theme).toBe('onionskin');
    expect(h.root.attrs['data-theme']).toBe('onionskin');
  });

  it('follows the OS to carbon when system prefers dark', () => {
    const c = new ThemeController(makeEnv({ dark: true }).env);
    expect(c.theme).toBe('carbon');
  });

  it('restores a stored explicit preference', () => {
    const c = new ThemeController(makeEnv({ stored: 'carbon' }).env);
    expect(c.preference).toBe('carbon');
    expect(c.theme).toBe('carbon');
  });

  it('falls back to system for a junk stored value', () => {
    const c = new ThemeController(makeEnv({ stored: 'sepia' }).env);
    expect(c.preference).toBe('system');
  });

  it('treats a missing media query as light, without subscribing', () => {
    const c = new ThemeController(makeEnv({ noMedia: true, dark: true }).env);
    expect(c.theme).toBe('onionskin');
  });
});

describe('ThemeController.setPreference', () => {
  it('persists and repaints when the resolved theme changes', () => {
    const h = makeEnv();
    const c = new ThemeController(h.env);
    c.setPreference('carbon');
    expect(c.preference).toBe('carbon');
    expect(c.theme).toBe('carbon');
    expect(h.store.get(THEME_STORAGE_KEY)).toBe('carbon');
    expect(h.root.attrs['data-theme']).toBe('carbon');
  });

  it('does not notify when the resolved theme is unchanged', () => {
    const h = makeEnv();
    const c = new ThemeController(h.env);
    const seen = vi.fn();
    c.subscribe(seen);
    c.setPreference('onionskin'); // already resolved to onionskin
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('ThemeController OS changes', () => {
  it('repaints on an OS change while following system', () => {
    const h = makeEnv();
    const c = new ThemeController(h.env);
    const seen = vi.fn();
    c.subscribe(seen);
    h.setDark(true);
    h.fireDark();
    expect(c.theme).toBe('carbon');
    expect(seen).toHaveBeenCalledWith('carbon');
  });

  it('ignores OS changes once an explicit preference is set', () => {
    const h = makeEnv();
    const c = new ThemeController(h.env);
    c.setPreference('onionskin');
    const seen = vi.fn();
    c.subscribe(seen);
    h.setDark(true);
    h.fireDark();
    expect(c.theme).toBe('onionskin');
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('ThemeController.subscribe', () => {
  it('stops notifying after unsubscribe', () => {
    const h = makeEnv();
    const c = new ThemeController(h.env);
    const seen = vi.fn();
    const off = c.subscribe(seen);
    off();
    h.setDark(true);
    h.fireDark();
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('browser adapters', () => {
  it('wraps a MediaQueryList', () => {
    const addEventListener = vi.fn();
    const fake = { matches: true, addEventListener } as unknown as MediaQueryList;
    const wrapped = mediaQueryEnv(fake);
    expect(wrapped.matches).toBe(true);
    const fn = () => {};
    wrapped.addListener(fn);
    expect(addEventListener).toHaveBeenCalledWith('change', fn);
  });

  it('builds an env from the real browser globals', () => {
    const env = browserThemeEnv();
    expect(env.storage).toBe(window.localStorage);
    const dark = env.matchDark();
    expect(dark).not.toBeNull();
    expect(typeof dark!.matches).toBe('boolean');
    dark!.addListener(() => {});
    env.root.setAttribute('data-theme', 'carbon');
    expect(document.documentElement.getAttribute('data-theme')).toBe('carbon');
  });
});
