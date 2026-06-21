/**
 * Compile and preview preferences, persisted in local storage.
 *
 * The parse/serialize logic is pure and the stores accept an injected `Storage`
 * slice so they can be unit-tested without a real browser.
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

// ─── Preview preferences ─────────────────────────────────────────────────────

/** The user's preview preferences. */
export interface PreviewPrefs {
  /**
   * Scroll the PDF pane to stay in sync with the editor cursor.
   * Off by default — the SyncTeX highlight is the primary navigation aid.
   */
  syncScroll: boolean;
}

/** Shipped defaults: synced scroll off. */
export const DEFAULT_PREVIEW_PREFS: PreviewPrefs = { syncScroll: false };

/** Storage key for the persisted preview preferences. */
export const PREVIEW_PREFS_STORAGE_KEY = 'galley:preview-prefs';

/** Parse persisted preview preferences, tolerating absent or malformed data. */
export function parsePreviewPrefs(raw: string | null): PreviewPrefs {
  if (raw === null) {
    return { ...DEFAULT_PREVIEW_PREFS };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREVIEW_PREFS };
  }
  if (typeof data !== 'object' || data === null) {
    return { ...DEFAULT_PREVIEW_PREFS };
  }
  const record = data as Record<string, unknown>;
  return {
    syncScroll: readBool(record.syncScroll, DEFAULT_PREVIEW_PREFS.syncScroll)
  };
}

/** Serialize preview preferences for storage. */
export function serializePreviewPrefs(prefs: PreviewPrefs): string {
  return JSON.stringify(prefs);
}

/** Persists preview preferences and notifies subscribers on every change. */
export class PreviewPrefsStore {
  #storage: Pick<Storage, 'getItem' | 'setItem'>;
  #prefs: PreviewPrefs;
  #listeners = new Set<(prefs: PreviewPrefs) => void>();

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.#storage = storage;
    this.#prefs = parsePreviewPrefs(storage.getItem(PREVIEW_PREFS_STORAGE_KEY));
  }

  /** The current preview preferences. */
  get prefs(): PreviewPrefs {
    return this.#prefs;
  }

  #commit(next: PreviewPrefs): void {
    this.#prefs = next;
    this.#storage.setItem(PREVIEW_PREFS_STORAGE_KEY, serializePreviewPrefs(next));
    for (const listener of this.#listeners) {
      listener(next);
    }
  }

  /** Enable or disable synced scroll. */
  setSyncScroll(syncScroll: boolean): void {
    this.#commit({ ...this.#prefs, syncScroll });
  }

  /** Subscribe to preference changes; returns an unsubscribe function. */
  subscribe(listener: (prefs: PreviewPrefs) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

// ─── Compile preferences ─────────────────────────────────────────────────────

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

// ─── Privacy preferences ─────────────────────────────────────────────────────

/** The user's privacy preferences. */
export interface PrivacyPrefs {
  /** Send anonymised crash reports. Off by default — opt-in only (§8.4). */
  crashReports: boolean;
}

/** The shipped defaults: nothing leaves the machine. */
export const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = { crashReports: false };

/** Storage key for the persisted privacy preferences. */
export const PRIVACY_PREFS_STORAGE_KEY = 'galley:privacy-prefs';

/** Parse persisted privacy preferences, tolerating absent or malformed data. */
export function parsePrivacyPrefs(raw: string | null): PrivacyPrefs {
  if (raw === null) {
    return { ...DEFAULT_PRIVACY_PREFS };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PRIVACY_PREFS };
  }
  if (typeof data !== 'object' || data === null) {
    return { ...DEFAULT_PRIVACY_PREFS };
  }
  const record = data as Record<string, unknown>;
  return { crashReports: readBool(record.crashReports, DEFAULT_PRIVACY_PREFS.crashReports) };
}

/** Serialize privacy preferences for storage. */
export function serializePrivacyPrefs(prefs: PrivacyPrefs): string {
  return JSON.stringify(prefs);
}

/** Persists privacy preferences and notifies subscribers on every change. */
export class PrivacyPrefsStore {
  #storage: Pick<Storage, 'getItem' | 'setItem'>;
  #prefs: PrivacyPrefs;
  #listeners = new Set<(prefs: PrivacyPrefs) => void>();

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.#storage = storage;
    this.#prefs = parsePrivacyPrefs(storage.getItem(PRIVACY_PREFS_STORAGE_KEY));
  }

  /** The current preferences. */
  get prefs(): PrivacyPrefs {
    return this.#prefs;
  }

  #commit(next: PrivacyPrefs): void {
    this.#prefs = next;
    this.#storage.setItem(PRIVACY_PREFS_STORAGE_KEY, serializePrivacyPrefs(next));
    for (const listener of this.#listeners) {
      listener(next);
    }
  }

  /** Enable or disable anonymised crash reporting. */
  setCrashReports(crashReports: boolean): void {
    this.#commit({ ...this.#prefs, crashReports });
  }

  /** Subscribe to preference changes; returns an unsubscribe function. */
  subscribe(listener: (prefs: PrivacyPrefs) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
