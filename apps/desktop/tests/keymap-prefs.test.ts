import { describe, it, expect, vi } from 'vitest';
import {
  parseEditorPrefs,
  serializeEditorPrefs,
  EditorPrefsStore,
  DEFAULT_EDITOR_PREFS,
  EDITOR_PREFS_KEY
} from '../src/lib/keymap-prefs';

describe('parseEditorPrefs', () => {
  it('returns defaults for null', () => {
    expect(parseEditorPrefs(null)).toEqual(DEFAULT_EDITOR_PREFS);
  });

  it('returns defaults for malformed JSON', () => {
    expect(parseEditorPrefs('not-json')).toEqual(DEFAULT_EDITOR_PREFS);
  });

  it('returns defaults for non-object JSON', () => {
    expect(parseEditorPrefs('"string"')).toEqual(DEFAULT_EDITOR_PREFS);
    expect(parseEditorPrefs('null')).toEqual(DEFAULT_EDITOR_PREFS);
    expect(parseEditorPrefs('42')).toEqual(DEFAULT_EDITOR_PREFS);
  });

  it('parses valid prefs', () => {
    const raw = JSON.stringify({ keymapMode: 'vim', spellCheck: true });
    expect(parseEditorPrefs(raw)).toEqual({ keymapMode: 'vim', spellCheck: true });
  });

  it('falls back to default keymapMode for unknown value', () => {
    const raw = JSON.stringify({ keymapMode: 'emacs', spellCheck: false });
    expect(parseEditorPrefs(raw).keymapMode).toBe('default');
  });

  it('falls back to default spellCheck for non-boolean', () => {
    const raw = JSON.stringify({ keymapMode: 'vim', spellCheck: 'yes' });
    expect(parseEditorPrefs(raw).spellCheck).toBe(false);
  });

  it('accepts keymapMode: "default" explicitly', () => {
    const raw = JSON.stringify({ keymapMode: 'default', spellCheck: true });
    expect(parseEditorPrefs(raw).keymapMode).toBe('default');
  });
});

describe('serializeEditorPrefs', () => {
  it('round-trips through parseEditorPrefs', () => {
    const prefs = { keymapMode: 'vim' as const, spellCheck: true };
    expect(parseEditorPrefs(serializeEditorPrefs(prefs))).toEqual(prefs);
  });
});

describe('EditorPrefsStore', () => {
  function makeStorage(initial: Record<string, string> = {}) {
    const store = new Map<string, string>(Object.entries(initial));
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      store
    };
  }

  it('starts with defaults when storage is empty', () => {
    const storage = makeStorage();
    const s = new EditorPrefsStore(storage);
    expect(s.prefs).toEqual(DEFAULT_EDITOR_PREFS);
  });

  it('loads persisted prefs on construction', () => {
    const raw = JSON.stringify({ keymapMode: 'vim', spellCheck: true });
    const storage = makeStorage({ [EDITOR_PREFS_KEY]: raw });
    const s = new EditorPrefsStore(storage);
    expect(s.prefs.keymapMode).toBe('vim');
    expect(s.prefs.spellCheck).toBe(true);
  });

  it('setKeymapMode persists and notifies', () => {
    const storage = makeStorage();
    const s = new EditorPrefsStore(storage);
    const listener = vi.fn();
    s.subscribe(listener);

    s.setKeymapMode('vim');
    expect(s.prefs.keymapMode).toBe('vim');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ keymapMode: 'vim' }));
    expect(storage.store.get(EDITOR_PREFS_KEY)).toContain('vim');
  });

  it('setSpellCheck persists and notifies', () => {
    const storage = makeStorage();
    const s = new EditorPrefsStore(storage);
    const listener = vi.fn();
    s.subscribe(listener);

    s.setSpellCheck(true);
    expect(s.prefs.spellCheck).toBe(true);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ spellCheck: true }));
  });

  it('unsubscribe stops notifications', () => {
    const storage = makeStorage();
    const s = new EditorPrefsStore(storage);
    const listener = vi.fn();
    const unsub = s.subscribe(listener);
    unsub();

    s.setKeymapMode('vim');
    expect(listener).not.toHaveBeenCalled();
  });
});
