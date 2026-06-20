import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseRegistry,
  serializeRegistry,
  upsertProject,
  removeProject,
  addTag,
  removeTag,
  searchProjects,
  allTags,
  ProjectRegistry,
  REGISTRY_STORAGE_KEY,
  type RegisteredProject
} from '../src/lib/project-registry';

// ---------------------------------------------------------------------------
// parseRegistry
// ---------------------------------------------------------------------------
describe('parseRegistry', () => {
  it('returns [] for null', () => {
    expect(parseRegistry(null)).toEqual([]);
  });

  it('returns [] for invalid JSON', () => {
    expect(parseRegistry('{bad')).toEqual([]);
  });

  it('returns [] for non-array JSON', () => {
    expect(parseRegistry(JSON.stringify({ root: '/a' }))).toEqual([]);
  });

  it('filters out invalid entries', () => {
    const raw = JSON.stringify([
      { root: '/a', name: 'A', tags: [], lastOpened: null },
      { root: 42, name: 'B', tags: [], lastOpened: null }, // invalid root
      null,
      { root: '/c', name: 'C', tags: ['x'], lastOpened: 1000 }
    ]);
    const result = parseRegistry(raw);
    expect(result).toHaveLength(2);
    expect(result[0].root).toBe('/a');
    expect(result[1].root).toBe('/c');
  });

  it('accepts entries with numeric lastOpened', () => {
    const entry: RegisteredProject = { root: '/x', name: 'X', tags: [], lastOpened: 42 };
    expect(parseRegistry(JSON.stringify([entry]))).toEqual([entry]);
  });

  it('filters out entries with non-string tags', () => {
    const raw = JSON.stringify([{ root: '/a', name: 'A', tags: [1, 2], lastOpened: null }]);
    expect(parseRegistry(raw)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// serializeRegistry / round-trip
// ---------------------------------------------------------------------------
describe('serializeRegistry', () => {
  it('round-trips a list through JSON', () => {
    const list: RegisteredProject[] = [
      { root: '/a', name: 'A', tags: ['research'], lastOpened: 1000 }
    ];
    expect(parseRegistry(serializeRegistry(list))).toEqual(list);
  });
});

// ---------------------------------------------------------------------------
// upsertProject
// ---------------------------------------------------------------------------
describe('upsertProject', () => {
  it('adds a new entry at the front (most recent first)', () => {
    const list: RegisteredProject[] = [{ root: '/b', name: 'B', tags: [], lastOpened: 500 }];
    const result = upsertProject(list, { root: '/a', name: 'A', tags: [], lastOpened: 1000 });
    expect(result[0].root).toBe('/a');
    expect(result[1].root).toBe('/b');
  });

  it('updates an existing entry (keeps it at top by lastOpened)', () => {
    const list: RegisteredProject[] = [
      { root: '/a', name: 'Old', tags: ['keep'], lastOpened: 100 },
      { root: '/b', name: 'B', tags: [], lastOpened: 500 }
    ];
    const result = upsertProject(list, { root: '/a', name: 'New', tags: [], lastOpened: 1000 });
    expect(result[0].root).toBe('/a');
    expect(result[0].name).toBe('New');
    // Tags from existing kept when incoming entry has no tags
    expect(result[0].tags).toEqual(['keep']);
    expect(result).toHaveLength(2);
  });

  it('overwrites tags when incoming entry supplies tags', () => {
    const list: RegisteredProject[] = [{ root: '/a', name: 'A', tags: ['old'], lastOpened: 100 }];
    const result = upsertProject(list, { root: '/a', name: 'A', tags: ['new'], lastOpened: 200 });
    expect(result[0].tags).toEqual(['new']);
  });

  it('sorts null-lastOpened to end', () => {
    const list: RegisteredProject[] = [{ root: '/b', name: 'B', tags: [], lastOpened: null }];
    const result = upsertProject(list, { root: '/a', name: 'A', tags: [], lastOpened: 1 });
    expect(result[0].root).toBe('/a');
  });

  it('two null-lastOpened entries maintain stable order', () => {
    const entry: RegisteredProject = { root: '/a', name: 'A', tags: [], lastOpened: null };
    const list: RegisteredProject[] = [{ root: '/b', name: 'B', tags: [], lastOpened: null }];
    const result = upsertProject(list, entry);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// removeProject
// ---------------------------------------------------------------------------
describe('removeProject', () => {
  it('removes the matching entry', () => {
    const list: RegisteredProject[] = [
      { root: '/a', name: 'A', tags: [], lastOpened: null },
      { root: '/b', name: 'B', tags: [], lastOpened: null }
    ];
    expect(removeProject(list, '/a').map((p) => p.root)).toEqual(['/b']);
  });

  it('is a no-op for an unknown root', () => {
    const list: RegisteredProject[] = [{ root: '/a', name: 'A', tags: [], lastOpened: null }];
    expect(removeProject(list, '/z')).toEqual(list);
  });
});

// ---------------------------------------------------------------------------
// addTag
// ---------------------------------------------------------------------------
describe('addTag', () => {
  it('adds a tag to a known project', () => {
    const list: RegisteredProject[] = [{ root: '/a', name: 'A', tags: [], lastOpened: null }];
    const result = addTag(list, '/a', 'thesis');
    expect(result[0].tags).toEqual(['thesis']);
  });

  it('is idempotent (no duplicate tags)', () => {
    const list: RegisteredProject[] = [
      { root: '/a', name: 'A', tags: ['thesis'], lastOpened: null }
    ];
    expect(addTag(list, '/a', 'thesis')[0].tags).toEqual(['thesis']);
  });

  it('trims the tag', () => {
    const list: RegisteredProject[] = [{ root: '/a', name: 'A', tags: [], lastOpened: null }];
    expect(addTag(list, '/a', '  work  ')[0].tags).toEqual(['work']);
  });

  it('ignores blank tags', () => {
    const list: RegisteredProject[] = [{ root: '/a', name: 'A', tags: [], lastOpened: null }];
    expect(addTag(list, '/a', '   ')[0].tags).toEqual([]);
  });

  it('is a no-op for an unknown root', () => {
    const list: RegisteredProject[] = [{ root: '/a', name: 'A', tags: [], lastOpened: null }];
    expect(addTag(list, '/z', 'tag')).toEqual(list);
  });
});

// ---------------------------------------------------------------------------
// removeTag
// ---------------------------------------------------------------------------
describe('removeTag', () => {
  it('removes an existing tag', () => {
    const list: RegisteredProject[] = [
      { root: '/a', name: 'A', tags: ['x', 'y'], lastOpened: null }
    ];
    expect(removeTag(list, '/a', 'x')[0].tags).toEqual(['y']);
  });

  it('is a no-op for a missing tag', () => {
    const list: RegisteredProject[] = [{ root: '/a', name: 'A', tags: ['x'], lastOpened: null }];
    expect(removeTag(list, '/a', 'z')[0].tags).toEqual(['x']);
  });

  it('is a no-op for an unknown root', () => {
    const list: RegisteredProject[] = [{ root: '/a', name: 'A', tags: ['x'], lastOpened: null }];
    expect(removeTag(list, '/z', 'x')).toEqual(list);
  });
});

// ---------------------------------------------------------------------------
// searchProjects
// ---------------------------------------------------------------------------
describe('searchProjects', () => {
  const projects: RegisteredProject[] = [
    { root: '/home/user/thesis', name: 'My Thesis', tags: ['research', 'phd'], lastOpened: 1 },
    { root: '/home/user/cv', name: 'Curriculum Vitae', tags: ['career'], lastOpened: 2 },
    { root: '/home/user/slides', name: 'Lecture Slides', tags: ['teaching'], lastOpened: 3 }
  ];

  it('returns all for empty query and no tag filter', () => {
    expect(searchProjects(projects, '')).toHaveLength(3);
  });

  it('filters by name (case-insensitive)', () => {
    const r = searchProjects(projects, 'thesis');
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('My Thesis');
  });

  it('filters by root path', () => {
    const r = searchProjects(projects, 'cv');
    expect(r[0].name).toBe('Curriculum Vitae');
  });

  it('filters by tag', () => {
    const r = searchProjects(projects, '', 'research');
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('My Thesis');
  });

  it('combines query and tag filter', () => {
    const r = searchProjects(projects, 'thesis', 'research');
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('My Thesis');
  });

  it('returns [] when nothing matches', () => {
    expect(searchProjects(projects, 'xyzzy')).toHaveLength(0);
  });

  it('ignores leading/trailing whitespace in query', () => {
    expect(searchProjects(projects, '  slides  ')).toHaveLength(1);
  });

  it('returns [] when tag filter matches no project', () => {
    expect(searchProjects(projects, '', 'nonexistent')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// allTags
// ---------------------------------------------------------------------------
describe('allTags', () => {
  it('returns sorted unique tags', () => {
    const list: RegisteredProject[] = [
      { root: '/a', name: 'A', tags: ['z', 'a'], lastOpened: null },
      { root: '/b', name: 'B', tags: ['a', 'm'], lastOpened: null }
    ];
    expect(allTags(list)).toEqual(['a', 'm', 'z']);
  });

  it('returns [] for empty list', () => {
    expect(allTags([])).toEqual([]);
  });

  it('returns [] when no project has tags', () => {
    const list: RegisteredProject[] = [{ root: '/a', name: 'A', tags: [], lastOpened: null }];
    expect(allTags(list)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ProjectRegistry (class)
// ---------------------------------------------------------------------------
describe('ProjectRegistry', () => {
  let store: Map<string, string>;
  let storage: Pick<Storage, 'getItem' | 'setItem'>;
  let registry: ProjectRegistry;

  beforeEach(() => {
    store = new Map();
    storage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      }
    };
    registry = new ProjectRegistry(storage);
  });

  it('starts empty with clean storage', () => {
    expect(registry.all()).toEqual([]);
  });

  it('loads existing data from storage', () => {
    const entries: RegisteredProject[] = [{ root: '/a', name: 'A', tags: [], lastOpened: 1 }];
    store.set(REGISTRY_STORAGE_KEY, JSON.stringify(entries));
    const r2 = new ProjectRegistry(storage);
    expect(r2.all()).toHaveLength(1);
  });

  it('upsert adds a project and persists it', () => {
    registry.upsert({ root: '/a', name: 'A', tags: [], lastOpened: 1 });
    expect(registry.all()).toHaveLength(1);
    expect(store.get(REGISTRY_STORAGE_KEY)).toBeDefined();
  });

  it('remove deletes a project and persists', () => {
    registry.upsert({ root: '/a', name: 'A', tags: [], lastOpened: 1 });
    registry.remove('/a');
    expect(registry.all()).toHaveLength(0);
    expect(store.get(REGISTRY_STORAGE_KEY)).toBe('[]');
  });

  it('addTag persists the new tag', () => {
    registry.upsert({ root: '/a', name: 'A', tags: [], lastOpened: null });
    registry.addTag('/a', 'draft');
    expect(registry.all()[0].tags).toEqual(['draft']);
    expect(store.get(REGISTRY_STORAGE_KEY)).toContain('draft');
  });

  it('removeTag persists the removal', () => {
    registry.upsert({ root: '/a', name: 'A', tags: ['draft'], lastOpened: null });
    registry.removeTag('/a', 'draft');
    expect(registry.all()[0].tags).toEqual([]);
  });

  it('search delegates to searchProjects', () => {
    registry.upsert({ root: '/a/thesis', name: 'Thesis', tags: [], lastOpened: null });
    registry.upsert({ root: '/b/cv', name: 'CV', tags: [], lastOpened: null });
    expect(registry.search('thesis')).toHaveLength(1);
    expect(registry.search('thesis')[0].name).toBe('Thesis');
  });

  it('search with tag filter', () => {
    registry.upsert({ root: '/a', name: 'A', tags: ['phd'], lastOpened: null });
    registry.upsert({ root: '/b', name: 'B', tags: [], lastOpened: null });
    expect(registry.search('', 'phd')).toHaveLength(1);
  });

  it('tags returns sorted unique tags', () => {
    registry.upsert({ root: '/a', name: 'A', tags: ['z', 'a'], lastOpened: null });
    expect(registry.tags()).toEqual(['a', 'z']);
  });

  it('tags returns [] when no tags exist', () => {
    registry.upsert({ root: '/a', name: 'A', tags: [], lastOpened: null });
    expect(registry.tags()).toEqual([]);
  });
});
