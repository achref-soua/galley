/**
 * The "recent projects" list: a small, most-recent-first list of the projects
 * the user has opened, persisted in local storage like the theme and layout.
 * The list logic is pure; the store only adds persistence.
 */

/** A project the user opened, as remembered for the recent list. */
export interface RecentProject {
  /** Absolute project root path (the dedup key). */
  root: string;
  /** Display name. */
  name: string;
}

/** How many recent projects to remember. */
export const RECENT_LIMIT = 8;

/** Storage key for the persisted recent-projects list. */
export const RECENT_STORAGE_KEY = 'galley:recent-projects';

/**
 * Return a new list with `entry` moved to the front, de-duplicated by `root`,
 * and capped at `limit`.
 */
export function recordRecent(
  list: RecentProject[],
  entry: RecentProject,
  limit = RECENT_LIMIT
): RecentProject[] {
  const withoutEntry = list.filter((project) => project.root !== entry.root);
  return [entry, ...withoutEntry].slice(0, limit);
}

function isRecentProject(value: unknown): value is RecentProject {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RecentProject).root === 'string' &&
    typeof (value as RecentProject).name === 'string'
  );
}

/** Parse a persisted recent-projects list, tolerating absent or invalid data. */
export function parseRecent(raw: string | null): RecentProject[] {
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
  return data.filter(isRecentProject);
}

/** Serialize a recent-projects list for storage. */
export function serializeRecent(list: RecentProject[]): string {
  return JSON.stringify(list);
}

/** Persists the recent-projects list and exposes the current list. */
export class RecentProjectsStore {
  #storage: Pick<Storage, 'getItem' | 'setItem'>;
  #list: RecentProject[];

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.#storage = storage;
    this.#list = parseRecent(storage.getItem(RECENT_STORAGE_KEY));
  }

  /** The current recent-projects list, most recent first. */
  list(): RecentProject[] {
    return this.#list;
  }

  /** Record a freshly opened project and persist the updated list. */
  record(entry: RecentProject): RecentProject[] {
    this.#list = recordRecent(this.#list, entry);
    this.#storage.setItem(RECENT_STORAGE_KEY, serializeRecent(this.#list));
    return this.#list;
  }
}
