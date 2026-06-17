import { describe, it, expect, vi } from 'vitest';
import {
  type CompilePrefs,
  DEFAULT_PREFS,
  PREFS_STORAGE_KEY,
  parsePrefs,
  serializePrefs,
  CompilePrefsStore
} from '../src/lib/settings-store';

describe('parsePrefs', () => {
  it('returns the defaults for missing data', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  });

  it('returns the defaults for malformed JSON', () => {
    expect(parsePrefs('{not json')).toEqual(DEFAULT_PREFS);
  });

  it('returns the defaults for non-objects, including null', () => {
    expect(parsePrefs('5')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('null')).toEqual(DEFAULT_PREFS);
  });

  it('fills missing or non-boolean fields from the defaults', () => {
    expect(parsePrefs('{}')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"autoCompile":"yes","soundOnSuccess":1}')).toEqual(DEFAULT_PREFS);
  });

  it('reads valid boolean fields', () => {
    expect(parsePrefs('{"autoCompile":false,"soundOnSuccess":true}')).toEqual({
      autoCompile: false,
      soundOnSuccess: true
    });
  });

  it('round-trips through serialize', () => {
    const prefs: CompilePrefs = { autoCompile: false, soundOnSuccess: true };
    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs);
  });
});

/** A Map-backed Storage slice, like the other store tests use. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value)
    }
  };
}

describe('CompilePrefsStore', () => {
  it('starts from persisted preferences', () => {
    const { storage, map } = memoryStorage();
    map.set(PREFS_STORAGE_KEY, serializePrefs({ autoCompile: false, soundOnSuccess: true }));
    const store = new CompilePrefsStore(storage);
    expect(store.prefs).toEqual({ autoCompile: false, soundOnSuccess: true });
  });

  it('persists and notifies on every change', () => {
    const { storage, map } = memoryStorage();
    const store = new CompilePrefsStore(storage);
    const seen: CompilePrefs[] = [];
    const unsubscribe = store.subscribe((prefs) => seen.push(prefs));

    store.setAutoCompile(false);
    store.setSoundOnSuccess(true);

    expect(store.prefs).toEqual({ autoCompile: false, soundOnSuccess: true });
    expect(JSON.parse(map.get(PREFS_STORAGE_KEY)!)).toEqual({
      autoCompile: false,
      soundOnSuccess: true
    });
    expect(seen).toEqual([
      { autoCompile: false, soundOnSuccess: false },
      { autoCompile: false, soundOnSuccess: true }
    ]);

    unsubscribe();
    store.setAutoCompile(true);
    expect(seen).toHaveLength(2); // no longer notified after unsubscribe
  });

  it('does not call back after the listener is unsubscribed', () => {
    const { storage } = memoryStorage();
    const store = new CompilePrefsStore(storage);
    const listener = vi.fn();
    store.subscribe(listener)();
    store.setSoundOnSuccess(true);
    expect(listener).not.toHaveBeenCalled();
  });
});
