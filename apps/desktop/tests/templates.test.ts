import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILT_IN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  filterTemplates,
  parseCustomTemplates,
  serializeCustomTemplates,
  addCustomTemplate,
  removeCustomTemplate,
  CustomTemplateStore,
  CUSTOM_TEMPLATES_KEY,
  type TemplateDefinition,
  type TemplateCategory
} from '../src/lib/templates';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    }
  };
}

function validTemplate(overrides: Partial<TemplateDefinition> = {}): TemplateDefinition {
  return {
    id: 'test-id',
    name: 'Test Template',
    category: 'Article',
    description: 'A test template.',
    body: '\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// BUILT_IN_TEMPLATES
// ---------------------------------------------------------------------------
describe('BUILT_IN_TEMPLATES', () => {
  it('includes at least one template per non-Custom category', () => {
    const cats = new Set(BUILT_IN_TEMPLATES.map((t) => t.category));
    for (const cat of TEMPLATE_CATEGORIES) {
      if (cat !== 'Custom') {
        expect(cats.has(cat), `no built-in template in category '${cat}'`).toBe(true);
      }
    }
  });

  it('every template has a unique id', () => {
    const ids = BUILT_IN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template body contains \\documentclass', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.body, t.id).toContain('\\documentclass');
    }
  });

  it('every template body contains \\begin{document} and \\end{document}', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.body, t.id).toContain('\\begin{document}');
      expect(t.body, t.id).toContain('\\end{document}');
    }
  });

  it('every template has a non-empty name and description', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.name.length, t.id).toBeGreaterThan(0);
      expect(t.description.length, t.id).toBeGreaterThan(0);
    }
  });

  it('has 12 built-in templates', () => {
    expect(BUILT_IN_TEMPLATES.length).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// filterTemplates
// ---------------------------------------------------------------------------
describe('filterTemplates', () => {
  const templates: TemplateDefinition[] = [
    validTemplate({
      id: 'a',
      name: 'Article',
      category: 'Article',
      description: 'A basic article.'
    }),
    validTemplate({
      id: 'b',
      name: 'IEEE Paper',
      category: 'Conference',
      description: 'Conference paper.'
    }),
    validTemplate({
      id: 'c',
      name: 'Thesis',
      category: 'Thesis & Report',
      description: 'PhD thesis document.'
    })
  ];

  it('returns all templates when category is null and query is empty', () => {
    expect(filterTemplates(templates, null, '')).toHaveLength(3);
  });

  it('returns all templates when category is null and query has only whitespace', () => {
    expect(filterTemplates(templates, null, '  ')).toHaveLength(3);
  });

  it('filters by category only', () => {
    const result = filterTemplates(templates, 'Article', '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns empty when no templates match the category', () => {
    expect(filterTemplates(templates, 'Book', '')).toHaveLength(0);
  });

  it('filters by query matching name (case-insensitive)', () => {
    const result = filterTemplates(templates, null, 'ieee');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('filters by query matching description (left side false, right side true)', () => {
    // "phd" matches description of 'c' but not its name
    const result = filterTemplates(templates, null, 'phd');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c');
  });

  it('filters by query matching name when description also matches', () => {
    // "article" matches name of 'a' AND description of 'a'
    const result = filterTemplates(templates, null, 'article');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns empty when query matches nothing', () => {
    expect(filterTemplates(templates, null, 'xyzzy')).toHaveLength(0);
  });

  it('applies both category and query filters together', () => {
    const result = filterTemplates(templates, 'Conference', 'ieee');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('returns empty when category matches but query does not', () => {
    expect(filterTemplates(templates, 'Article', 'xyzzy')).toHaveLength(0);
  });

  it('returns empty on an empty template list', () => {
    expect(filterTemplates([], null, '')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseCustomTemplates
// ---------------------------------------------------------------------------
describe('parseCustomTemplates', () => {
  it('returns [] for null', () => {
    expect(parseCustomTemplates(null)).toEqual([]);
  });

  it('returns [] for invalid JSON', () => {
    expect(parseCustomTemplates('{bad')).toEqual([]);
  });

  it('returns [] for non-array JSON', () => {
    expect(parseCustomTemplates(JSON.stringify({ id: 'x' }))).toEqual([]);
  });

  it('filters out a primitive (number) entry — covers typeof !== object branch', () => {
    const raw = JSON.stringify([42, validTemplate()]);
    const result = parseCustomTemplates(raw);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test-id');
  });

  it('filters out null entry — covers typeof=object && value===null branch', () => {
    const raw = JSON.stringify([null, validTemplate()]);
    const result = parseCustomTemplates(raw);
    expect(result).toHaveLength(1);
  });

  it('filters out entries with non-string id', () => {
    const raw = JSON.stringify([{ ...validTemplate(), id: 42 }]);
    expect(parseCustomTemplates(raw)).toEqual([]);
  });

  it('filters out entries with non-string name', () => {
    const raw = JSON.stringify([{ ...validTemplate(), name: true }]);
    expect(parseCustomTemplates(raw)).toEqual([]);
  });

  it('filters out entries with non-string category', () => {
    const raw = JSON.stringify([{ ...validTemplate(), category: 99 }]);
    expect(parseCustomTemplates(raw)).toEqual([]);
  });

  it('filters out entries with category not in TEMPLATE_CATEGORIES', () => {
    const raw = JSON.stringify([{ ...validTemplate(), category: 'NotACategory' }]);
    expect(parseCustomTemplates(raw)).toEqual([]);
  });

  it('filters out entries with non-string description', () => {
    const raw = JSON.stringify([{ ...validTemplate(), description: null }]);
    expect(parseCustomTemplates(raw)).toEqual([]);
  });

  it('filters out entries with non-string body', () => {
    const raw = JSON.stringify([{ ...validTemplate(), body: [] }]);
    expect(parseCustomTemplates(raw)).toEqual([]);
  });

  it('returns valid entries', () => {
    const entry = validTemplate();
    const raw = JSON.stringify([entry]);
    const result = parseCustomTemplates(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(entry);
  });

  it('accepts every valid TemplateCategory', () => {
    for (const cat of TEMPLATE_CATEGORIES) {
      const entry = validTemplate({ id: cat, category: cat as TemplateCategory });
      const raw = JSON.stringify([entry]);
      expect(parseCustomTemplates(raw)).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// serializeCustomTemplates / round-trip
// ---------------------------------------------------------------------------
describe('serializeCustomTemplates', () => {
  it('round-trips a list through JSON', () => {
    const list = [validTemplate()];
    expect(parseCustomTemplates(serializeCustomTemplates(list))).toEqual(list);
  });

  it('round-trips an empty list', () => {
    expect(parseCustomTemplates(serializeCustomTemplates([]))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addCustomTemplate
// ---------------------------------------------------------------------------
describe('addCustomTemplate', () => {
  it('adds a new entry to an empty list', () => {
    const t = validTemplate();
    const result = addCustomTemplate([], t);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(t);
  });

  it('appends a new entry to an existing list', () => {
    const a = validTemplate({ id: 'a' });
    const b = validTemplate({ id: 'b' });
    const result = addCustomTemplate([a], b);
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe('b');
  });

  it('replaces an existing entry with the same id', () => {
    const original = validTemplate({ id: 'x', name: 'Old' });
    const updated = validTemplate({ id: 'x', name: 'New' });
    const result = addCustomTemplate([original], updated);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New');
  });
});

// ---------------------------------------------------------------------------
// removeCustomTemplate
// ---------------------------------------------------------------------------
describe('removeCustomTemplate', () => {
  it('removes the entry with the matching id', () => {
    const a = validTemplate({ id: 'a' });
    const b = validTemplate({ id: 'b' });
    const result = removeCustomTemplate([a, b], 'a');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('returns an unchanged list when id is not found', () => {
    const a = validTemplate({ id: 'a' });
    const result = removeCustomTemplate([a], 'z');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns empty list when removing the only entry', () => {
    const a = validTemplate({ id: 'a' });
    expect(removeCustomTemplate([a], 'a')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CustomTemplateStore
// ---------------------------------------------------------------------------
describe('CustomTemplateStore', () => {
  let storage: Pick<Storage, 'getItem' | 'setItem'>;

  beforeEach(() => {
    storage = makeStorage();
  });

  it('initialises to an empty list when storage is empty', () => {
    const store = new CustomTemplateStore(storage);
    expect(store.all()).toHaveLength(0);
  });

  it('parses existing storage on construction', () => {
    const t = validTemplate();
    storage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify([t]));
    const store = new CustomTemplateStore(storage);
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].id).toBe('test-id');
  });

  it('add() inserts an entry and persists it', () => {
    const store = new CustomTemplateStore(storage);
    store.add(validTemplate());
    expect(store.all()).toHaveLength(1);
    // Persisted: a fresh store reads the same data.
    const store2 = new CustomTemplateStore(storage);
    expect(store2.all()).toHaveLength(1);
  });

  it('add() replaces an existing entry with the same id', () => {
    const store = new CustomTemplateStore(storage);
    store.add(validTemplate({ id: 'x', name: 'Old' }));
    store.add(validTemplate({ id: 'x', name: 'New' }));
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].name).toBe('New');
  });

  it('remove() deletes an entry and persists the change', () => {
    const store = new CustomTemplateStore(storage);
    store.add(validTemplate({ id: 'a' }));
    store.add(validTemplate({ id: 'b' }));
    store.remove('a');
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].id).toBe('b');
    const store2 = new CustomTemplateStore(storage);
    expect(store2.all()).toHaveLength(1);
  });

  it('remove() is a no-op when id is not found', () => {
    const store = new CustomTemplateStore(storage);
    store.add(validTemplate({ id: 'a' }));
    store.remove('z');
    expect(store.all()).toHaveLength(1);
  });
});
