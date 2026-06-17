/**
 * Compile preferences: whether to recompile as you type, and whether to ring a
 * bell on success. Persisted in local storage like the theme and layout; the
 * parse/serialize logic is pure and the store only adds persistence and change
 * notification, so it tests with an injected `Storage`.
 */

/** The user's compilation preferences. */
export interface CompilePrefs {
  /** Recompile automatically (debounced) as the document changes. */
  autoCompile: boolean;
  /** Ring a short bell when a build succeeds. */
  soundOnSuccess: boolean;
}

/** The shipped defaults: compile as you type, stay silent. */
export const DEFAULT_PREFS: CompilePrefs = { autoCompile: true, soundOnSuccess: false };

/** Storage key for the persisted compile preferences. */
export const PREFS_STORAGE_KEY = 'galley:compile-prefs';

/** Parse persisted preferences, tolerating absent, malformed, or partial data. */
export function parsePrefs(raw: string | null): CompilePrefs {
  if (raw === null) {
    return { ...DEFAULT_PREFS };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREFS };
  }
  if (typeof data !== 'object' || data === null) {
    return { ...DEFAULT_PREFS };
  }
  const record = data as Record<string, unknown>;
  return {
    autoCompile: readBool(record.autoCompile, DEFAULT_PREFS.autoCompile),
    soundOnSuccess: readBool(record.soundOnSuccess, DEFAULT_PREFS.soundOnSuccess)
  };
}

/** Read a boolean field, falling back to `fallback` when it is not a boolean. */
function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Serialize preferences for storage. */
export function serializePrefs(prefs: CompilePrefs): string {
  return JSON.stringify(prefs);
}

/** Persists compile preferences and notifies subscribers on every change. */
export class CompilePrefsStore {
  #storage: Pick<Storage, 'getItem' | 'setItem'>;
  #prefs: CompilePrefs;
  #listeners = new Set<(prefs: CompilePrefs) => void>();

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.#storage = storage;
    this.#prefs = parsePrefs(storage.getItem(PREFS_STORAGE_KEY));
  }

  /** The current preferences. */
  get prefs(): CompilePrefs {
    return this.#prefs;
  }

  #commit(next: CompilePrefs): void {
    this.#prefs = next;
    this.#storage.setItem(PREFS_STORAGE_KEY, serializePrefs(next));
    for (const listener of this.#listeners) {
      listener(next);
    }
  }

  /** Enable or disable compile-as-you-type. */
  setAutoCompile(autoCompile: boolean): void {
    this.#commit({ ...this.#prefs, autoCompile });
  }

  /** Enable or disable the success bell. */
  setSoundOnSuccess(soundOnSuccess: boolean): void {
    this.#commit({ ...this.#prefs, soundOnSuccess });
  }

  /** Subscribe to preference changes; returns an unsubscribe function. */
  subscribe(listener: (prefs: CompilePrefs) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
