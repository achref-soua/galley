import { describe, it, expect, vi } from 'vitest';
import {
  type CompilePrefs,
  DEFAULT_PREFS,
  PREFS_STORAGE_KEY,
  parsePrefs,
  serializePrefs,
  CompilePrefsStore,
  type PreviewPrefs,
  DEFAULT_PREVIEW_PREFS,
  PREVIEW_PREFS_STORAGE_KEY,
  parsePreviewPrefs,
  serializePreviewPrefs,
  PreviewPrefsStore,
  DEFAULT_PRIVACY_PREFS,
  PRIVACY_PREFS_STORAGE_KEY,
  parsePrivacyPrefs,
  serializePrivacyPrefs,
  PrivacyPrefsStore
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

describe('parsePreviewPrefs', () => {
  it('returns the defaults for missing data', () => {
    expect(parsePreviewPrefs(null)).toEqual(DEFAULT_PREVIEW_PREFS);
  });

  it('returns the defaults for malformed JSON', () => {
    expect(parsePreviewPrefs('{bad')).toEqual(DEFAULT_PREVIEW_PREFS);
  });

  it('returns the defaults for non-objects', () => {
    expect(parsePreviewPrefs('42')).toEqual(DEFAULT_PREVIEW_PREFS);
    expect(parsePreviewPrefs('null')).toEqual(DEFAULT_PREVIEW_PREFS);
  });

  it('fills missing or non-boolean fields from the defaults', () => {
    expect(parsePreviewPrefs('{}')).toEqual(DEFAULT_PREVIEW_PREFS);
    expect(parsePreviewPrefs('{"syncScroll":"yes"}')).toEqual(DEFAULT_PREVIEW_PREFS);
  });

  it('reads a valid syncScroll boolean', () => {
    expect(parsePreviewPrefs('{"syncScroll":true}')).toEqual({ syncScroll: true });
    expect(parsePreviewPrefs('{"syncScroll":false}')).toEqual({ syncScroll: false });
  });

  it('round-trips through serializePreviewPrefs', () => {
    const prefs: PreviewPrefs = { syncScroll: true };
    expect(parsePreviewPrefs(serializePreviewPrefs(prefs))).toEqual(prefs);
  });
});

describe('PreviewPrefsStore', () => {
  it('defaults syncScroll to false', () => {
    const { storage } = memoryStorage();
    const store = new PreviewPrefsStore(storage);
    expect(store.prefs.syncScroll).toBe(false);
  });

  it('starts from persisted preferences', () => {
    const { storage, map } = memoryStorage();
    map.set(PREVIEW_PREFS_STORAGE_KEY, serializePreviewPrefs({ syncScroll: true }));
    const store = new PreviewPrefsStore(storage);
    expect(store.prefs.syncScroll).toBe(true);
  });

  it('persists and notifies on setSyncScroll', () => {
    const { storage, map } = memoryStorage();
    const store = new PreviewPrefsStore(storage);
    const seen: PreviewPrefs[] = [];
    const unsubscribe = store.subscribe((p) => seen.push(p));

    store.setSyncScroll(true);

    expect(store.prefs.syncScroll).toBe(true);
    expect(JSON.parse(map.get(PREVIEW_PREFS_STORAGE_KEY)!)).toEqual({ syncScroll: true });
    expect(seen).toEqual([{ syncScroll: true }]);

    unsubscribe();
    store.setSyncScroll(false);
    expect(seen).toHaveLength(1);
  });

  it('does not call back after the listener is unsubscribed', () => {
    const { storage } = memoryStorage();
    const store = new PreviewPrefsStore(storage);
    const listener = vi.fn();
    store.subscribe(listener)();
    store.setSyncScroll(true);
    expect(listener).not.toHaveBeenCalled();
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

describe('parsePrivacyPrefs', () => {
  it('defaults to crash reports off when absent', () => {
    expect(parsePrivacyPrefs(null)).toEqual(DEFAULT_PRIVACY_PREFS);
    expect(DEFAULT_PRIVACY_PREFS.crashReports).toBe(false);
  });

  it('defaults on malformed or non-object data', () => {
    expect(parsePrivacyPrefs('not json')).toEqual(DEFAULT_PRIVACY_PREFS);
    expect(parsePrivacyPrefs('5')).toEqual(DEFAULT_PRIVACY_PREFS);
  });

  it('reads a persisted value', () => {
    expect(parsePrivacyPrefs(serializePrivacyPrefs({ crashReports: true }))).toEqual({
      crashReports: true
    });
  });
});

describe('PrivacyPrefsStore', () => {
  it('starts from the defaults', () => {
    const { storage } = memoryStorage();
    expect(new PrivacyPrefsStore(storage).prefs.crashReports).toBe(false);
  });

  it('starts from persisted preferences', () => {
    const { storage, map } = memoryStorage();
    map.set(PRIVACY_PREFS_STORAGE_KEY, serializePrivacyPrefs({ crashReports: true }));
    expect(new PrivacyPrefsStore(storage).prefs.crashReports).toBe(true);
  });

  it('persists and notifies on setCrashReports', () => {
    const { storage, map } = memoryStorage();
    const store = new PrivacyPrefsStore(storage);
    const seen: boolean[] = [];
    const unsubscribe = store.subscribe((p) => seen.push(p.crashReports));
    store.setCrashReports(true);
    expect(store.prefs.crashReports).toBe(true);
    expect(map.get(PRIVACY_PREFS_STORAGE_KEY)).toBe(serializePrivacyPrefs({ crashReports: true }));
    expect(seen).toEqual([true]);
    unsubscribe();
    store.setCrashReports(false);
    expect(seen).toHaveLength(1);
  });
});
