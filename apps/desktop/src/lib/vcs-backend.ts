/**
 * VcsBackend — port for the git-backed version history.
 *
 * The Tauri adapter calls the four `vcs_*` commands in src-tauri/src/lib.rs.
 * The browser adapter keeps an in-memory list of commits for tests and the
 * Playwright e2e suite. Both implement the same `VcsBackend` interface.
 */

import type { SnapshotEntry } from './vcs';

/** Port for auto-checkpoints, named snapshots, timeline, and restore. */
export interface VcsBackend {
  /** Record an automatic checkpoint. Returns the checkpoint id, or null. */
  autoCheckpoint(root: string, content: string): Promise<string | null>;
  /** Store a user-named snapshot. Returns the checkpoint id, or null. */
  createSnapshot(root: string, content: string, name: string): Promise<string | null>;
  /** List checkpoints most-recent first. */
  listCheckpoints(root: string): Promise<SnapshotEntry[]>;
  /** Retrieve the document content at a given checkpoint. */
  getContent(root: string, checkpointId: string): Promise<string | null>;
}

// ── Tauri adapter ─────────────────────────────────────────────────────────────

/** Adapter that calls the real Tauri commands backed by git2. */
function tauriVcsBackend(): VcsBackend {
  // Dynamic import keeps pdfjs/tauri out of the test bundle.
  const inv = () => import('@tauri-apps/api/core').then((m) => m.invoke);

  return {
    async autoCheckpoint(root, content) {
      try {
        const invoke = await inv();
        return await invoke<string>('vcs_auto_checkpoint', { projectRoot: root, content });
      } catch {
        return null;
      }
    },
    async createSnapshot(root, content, name) {
      try {
        const invoke = await inv();
        return await invoke<string>('vcs_create_snapshot', { projectRoot: root, content, name });
      } catch {
        return null;
      }
    },
    async listCheckpoints(root) {
      try {
        const invoke = await inv();
        const rows = await invoke<
          {
            id: string;
            name: string;
            date: string;
            isNamed: boolean;
            linesAdded: number;
            linesRemoved: number;
          }[]
        >('vcs_list_checkpoints', { projectRoot: root });
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          date: r.date,
          isNamed: r.isNamed,
          linesAdded: r.linesAdded,
          linesRemoved: r.linesRemoved
        }));
      } catch {
        return [];
      }
    },
    async getContent(root, checkpointId) {
      try {
        const invoke = await inv();
        return await invoke<string | null>('vcs_get_content', {
          projectRoot: root,
          checkpointId
        });
      } catch {
        return null;
      }
    }
  };
}

// ── In-memory / browser adapter ───────────────────────────────────────────────

interface MemCommit {
  id: string;
  name: string;
  date: string;
  content: string;
}

/** In-memory adapter for tests and the browser demo. */
export function browserVcsBackend(): VcsBackend {
  const store = new Map<string, MemCommit[]>(); // root → commits
  let counter = 1;

  function getCommits(root: string): MemCommit[] {
    if (!store.has(root)) {
      store.set(root, []);
    }
    return store.get(root)!;
  }

  function makeId(): string {
    return (counter++).toString(16).padStart(16, '0');
  }

  function addCommit(root: string, content: string, name: string): string {
    const id = makeId();
    getCommits(root).push({ id, name, date: '2026-01-01T00:00:00Z', content });
    return id;
  }

  return {
    async autoCheckpoint(root, content) {
      return addCommit(root, content, 'auto');
    },
    async createSnapshot(root, content, name) {
      return addCommit(root, content, name);
    },
    async listCheckpoints(root) {
      const commits = getCommits(root);
      return [...commits].reverse().map((c, idx, arr) => {
        const prev = arr[idx + 1];
        const prevLines = prev != null ? prev.content.split('\n') : [];
        const curLines = c.content.split('\n');
        const added = curLines.filter((l) => !prevLines.includes(l)).length;
        const removed = prevLines.filter((l) => !curLines.includes(l)).length;
        return {
          id: c.id,
          name: c.name,
          date: c.date,
          isNamed: c.name !== 'auto',
          linesAdded: added,
          linesRemoved: removed
        };
      });
    },
    async getContent(root, checkpointId) {
      const commit = getCommits(root).find((c) => c.id === checkpointId);
      return commit != null ? commit.content : null;
    }
  };
}

/** Select the appropriate VcsBackend for the current environment. */
export function selectVcsBackend(): VcsBackend {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return tauriVcsBackend();
  }
  return browserVcsBackend();
}
