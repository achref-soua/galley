/**
 * The project registry: a searchable, tag-aware list of every project the user
 * has touched, persisted in local storage. Unlike the 8-entry recent list, the
 * registry is unbounded and enriched with tags and last-opened timestamps so
 * users can organise large collections.
 *
 * All decision logic is in pure helper functions (bottom half of this file),
 * testable without storage. The {@link ProjectRegistry} class only adds
 * persistence.
 */

/** An entry in the project registry. */
export interface RegisteredProject {
  /** Absolute project root path (the unique key). */
  root: string;
  /** Display name. */
  name: string;
  /** User-assigned tags. */
  tags: string[];
  /** Unix timestamp (ms) of the last time this project was opened, or `null`. */
  lastOpened: number | null;
}

/** Storage key for the persisted project registry. */
export const REGISTRY_STORAGE_KEY = 'galley:project-registry';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Return `true` when `value` is a valid {@link RegisteredProject} shape.
 * Used to sanitise JSON loaded from local storage.
 */
function isRegistered(value: unknown): value is RegisteredProject {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v['root'] === 'string' &&
    typeof v['name'] === 'string' &&
    Array.isArray(v['tags']) &&
    (v['tags'] as unknown[]).every((t) => typeof t === 'string') &&
    (v['lastOpened'] === null || typeof v['lastOpened'] === 'number')
  );
}

/** Parse a persisted registry, tolerating absent or invalid data. */
export function parseRegistry(raw: string | null): RegisteredProject[] {
  if (raw === null) {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(isRegistered);
}

/** Serialise a registry list for storage. */
export function serializeRegistry(list: RegisteredProject[]): string {
  return JSON.stringify(list);
}

/**
 * Add or update `entry` in `list`, keyed by `root`. Updated projects keep
 * their existing tags when none are supplied on the incoming entry. Returns
 * the new list, sorted most-recently-opened first.
 */
export function upsertProject(
  list: RegisteredProject[],
  entry: RegisteredProject
): RegisteredProject[] {
  const existing = list.find((p) => p.root === entry.root);
  const merged: RegisteredProject = {
    ...entry,
    tags: entry.tags.length > 0 ? entry.tags : (existing?.tags ?? [])
  };
  const without = list.filter((p) => p.root !== entry.root);
  const next = [merged, ...without];
  // Sort most-recently-opened first; projects with no timestamp go last.
  return next.sort((a, b) => {
    const ta = a.lastOpened ?? -1;
    const tb = b.lastOpened ?? -1;
    return tb - ta;
  });
}

/** Remove the project at `root` from `list`. Returns the updated list. */
export function removeProject(list: RegisteredProject[], root: string): RegisteredProject[] {
  return list.filter((p) => p.root !== root);
}

/**
 * Add `tag` to the project at `root`. No-op if the tag already exists or the
 * project is not found. Returns the updated list.
 */
export function addTag(list: RegisteredProject[], root: string, tag: string): RegisteredProject[] {
  const trimmed = tag.trim();
  if (trimmed === '') {
    return list;
  }
  return list.map((p) => {
    if (p.root !== root) {
      return p;
    }
    if (p.tags.includes(trimmed)) {
      return p;
    }
    return { ...p, tags: [...p.tags, trimmed] };
  });
}

/**
 * Remove `tag` from the project at `root`. No-op if not found. Returns the
 * updated list.
 */
export function removeTag(
  list: RegisteredProject[],
  root: string,
  tag: string
): RegisteredProject[] {
  return list.map((p) => {
    if (p.root !== root) {
      return p;
    }
    return { ...p, tags: p.tags.filter((t) => t !== tag) };
  });
}

/**
 * Filter `list` by `query` (matches name or root path, case-insensitive) and
 * optionally by `filterTag` (project must carry the tag). Returns matching
 * projects in their current order.
 */
export function searchProjects(
  list: RegisteredProject[],
  query: string,
  filterTag?: string
): RegisteredProject[] {
  const q = query.trim().toLowerCase();
  return list.filter((p) => {
    if (filterTag !== undefined && !p.tags.includes(filterTag)) {
      return false;
    }
    if (q === '') {
      return true;
    }
    return p.name.toLowerCase().includes(q) || p.root.toLowerCase().includes(q);
  });
}

/**
 * Return the sorted, deduplicated set of all tags used across `list`.
 */
export function allTags(list: RegisteredProject[]): string[] {
  const set = new Set<string>();
  for (const p of list) {
    for (const t of p.tags) {
      set.add(t);
    }
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Stateful store
// ---------------------------------------------------------------------------

/** Persists the project registry and exposes read/write operations. */
export class ProjectRegistry {
  #storage: Pick<Storage, 'getItem' | 'setItem'>;
  #list: RegisteredProject[];

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.#storage = storage;
    this.#list = parseRegistry(storage.getItem(REGISTRY_STORAGE_KEY));
  }

  #save(): void {
    this.#storage.setItem(REGISTRY_STORAGE_KEY, serializeRegistry(this.#list));
  }

  /** All registered projects, most-recently-opened first. */
  all(): RegisteredProject[] {
    return this.#list;
  }

  /** Filter by query and optional tag. */
  search(query: string, filterTag?: string): RegisteredProject[] {
    return searchProjects(this.#list, query, filterTag);
  }

  /** All tags in use across the registry, sorted alphabetically. */
  tags(): string[] {
    return allTags(this.#list);
  }

  /** Add or update an entry, then persist. */
  upsert(entry: RegisteredProject): void {
    this.#list = upsertProject(this.#list, entry);
    this.#save();
  }

  /** Remove a project by root, then persist. */
  remove(root: string): void {
    this.#list = removeProject(this.#list, root);
    this.#save();
  }

  /** Add a tag to a project, then persist. */
  addTag(root: string, tag: string): void {
    this.#list = addTag(this.#list, root, tag);
    this.#save();
  }

  /** Remove a tag from a project, then persist. */
  removeTag(root: string, tag: string): void {
    this.#list = removeTag(this.#list, root, tag);
    this.#save();
  }
}
