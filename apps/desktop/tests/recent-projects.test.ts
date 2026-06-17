import { describe, it, expect } from 'vitest';
import {
  type RecentProject,
  RECENT_STORAGE_KEY,
  RecentProjectsStore,
  parseRecent,
  recordRecent,
  serializeRecent
} from '../src/lib/recent-projects';

const a: RecentProject = { root: '/a', name: 'A' };
const b: RecentProject = { root: '/b', name: 'B' };
const c: RecentProject = { root: '/c', name: 'C' };

describe('recordRecent', () => {
  it('moves an entry to the front, de-duplicating by root', () => {
    expect(recordRecent([a, b], c)).toEqual([c, a, b]);
    // Re-opening A bubbles it to the front and removes the old copy.
    expect(recordRecent([a, b], { root: '/a', name: 'A renamed' })).toEqual([
      { root: '/a', name: 'A renamed' },
      b
    ]);
  });

  it('caps the list at the limit', () => {
    expect(recordRecent([a, b], c, 2)).toEqual([c, a]);
  });
});

describe('parseRecent', () => {
  it('returns an empty list for missing storage', () => {
    expect(parseRecent(null)).toEqual([]);
  });

  it('returns an empty list for invalid JSON', () => {
    expect(parseRecent('{not json')).toEqual([]);
  });

  it('returns an empty list when the data is not an array', () => {
    expect(parseRecent('{"root":"/a"}')).toEqual([]);
  });

  it('keeps only well-formed entries', () => {
    const raw = JSON.stringify([a, null, 42, { root: 1 }, { root: '/x' }, b]);
    expect(parseRecent(raw)).toEqual([a, b]);
  });

  it('round-trips through serialize', () => {
    expect(parseRecent(serializeRecent([a, b]))).toEqual([a, b]);
  });
});

describe('RecentProjectsStore', () => {
  function makeStorage(initial?: string) {
    const map = new Map<string, string>();
    if (initial !== undefined) {
      map.set(RECENT_STORAGE_KEY, initial);
    }
    return {
      map,
      storage: {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => void map.set(key, value)
      }
    };
  }

  it('loads, records, and persists', () => {
    const { map, storage } = makeStorage(serializeRecent([a]));
    const store = new RecentProjectsStore(storage);
    expect(store.list()).toEqual([a]);

    const updated = store.record(b);
    expect(updated).toEqual([b, a]);
    expect(store.list()).toEqual([b, a]);
    expect(parseRecent(map.get(RECENT_STORAGE_KEY) ?? null)).toEqual([b, a]);
  });

  it('starts empty when storage has nothing', () => {
    const { storage } = makeStorage();
    expect(new RecentProjectsStore(storage).list()).toEqual([]);
  });
});
