/**
 * Editor key-map preferences: which editing mode is active and whether
 * spell-check is enabled. Persisted in local storage and mirrored by
 * the editor via a CM6 Compartment.
 *
 * Pattern mirrors {@link CompilePrefsStore} so the same test strategy applies.
 */

/** The supported editor key-map modes. */
export type KeymapMode = 'default' | 'vim';

/** The user's editor preferences. */
export interface EditorPrefs {
  /** The active key-map mode. */
  keymapMode: KeymapMode;
  /** Whether spell-check is enabled (off by default). */
  spellCheck: boolean;
}

/** The shipped defaults: standard CM6 key-map, spell-check off. */
export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  keymapMode: 'default',
  spellCheck: false
};

/** Storage key for editor preferences. */
export const EDITOR_PREFS_KEY = 'galley:editor-prefs';

/** Parse persisted editor preferences, tolerating absent or malformed data. */
export function parseEditorPrefs(raw: string | null): EditorPrefs {
  if (raw === null) {
    return { ...DEFAULT_EDITOR_PREFS };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_EDITOR_PREFS };
  }
  if (typeof data !== 'object' || data === null) {
    return { ...DEFAULT_EDITOR_PREFS };
  }
  const rec = data as Record<string, unknown>;
  return {
    keymapMode: readKeymapMode(rec.keymapMode),
    spellCheck: readBool(rec.spellCheck, DEFAULT_EDITOR_PREFS.spellCheck)
  };
}

/** Serialize editor preferences for storage. */
export function serializeEditorPrefs(prefs: EditorPrefs): string {
  return JSON.stringify(prefs);
}

function readKeymapMode(value: unknown): KeymapMode {
  return value === 'vim' ? 'vim' : 'default';
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Persists editor preferences and notifies subscribers on change. */
export class EditorPrefsStore {
  #storage: Pick<Storage, 'getItem' | 'setItem'>;
  #prefs: EditorPrefs;
  #listeners = new Set<(prefs: EditorPrefs) => void>();

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.#storage = storage;
    this.#prefs = parseEditorPrefs(storage.getItem(EDITOR_PREFS_KEY));
  }

  /** The current editor preferences. */
  get prefs(): EditorPrefs {
    return this.#prefs;
  }

  #commit(next: EditorPrefs): void {
    this.#prefs = next;
    this.#storage.setItem(EDITOR_PREFS_KEY, serializeEditorPrefs(next));
    for (const listener of this.#listeners) {
      listener(next);
    }
  }

  /** Set the key-map mode. */
  setKeymapMode(keymapMode: KeymapMode): void {
    this.#commit({ ...this.#prefs, keymapMode });
  }

  /** Enable or disable spell-check. */
  setSpellCheck(spellCheck: boolean): void {
    this.#commit({ ...this.#prefs, spellCheck });
  }

  /** Subscribe to preference changes; returns an unsubscribe function. */
  subscribe(listener: (prefs: EditorPrefs) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
