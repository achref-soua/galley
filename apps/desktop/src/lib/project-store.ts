/**
 * The project controller: the single owner of "which project is open, which
 * document is showing, what has been edited, and what is unsaved". It drives the
 * sidebar, the editor, and the unsaved-changes guard.
 *
 * All of the decision logic lives here (not in the Svelte components) so it can
 * be tested directly against a fake {@link ProjectBackend}.
 */

import { type ProjectBackend, type ProjectSnapshot } from './project-backend';
import { type RecentProject, RecentProjectsStore } from './recent-projects';
import { basename } from './file-tree';

/** A navigation the user must resolve because the open document is unsaved. */
export interface PendingOpen {
  /** A human label for the guard prompt. */
  label: string;
  /** The project root of the file to open. */
  root: string;
  /** The project-relative file to open once resolved. */
  path: string;
}

/** The full, observable project state. */
export interface ProjectState {
  /** The open project, or `null` when none is open. */
  project: ProjectSnapshot | null;
  /** The open document's path, or `null` when none is open. */
  activePath: string | null;
  /** The editor's current contents. */
  content: string;
  /** The last-saved contents (dirty = `content !== savedContent`). */
  savedContent: string;
  /** The last error message, or `null`. */
  error: string | null;
  /** A pending navigation awaiting the unsaved-changes guard, or `null`. */
  pending: PendingOpen | null;
  /** The recent-projects list, most recent first. */
  recent: RecentProject[];
}

/** Owns project state and notifies subscribers on every change. */
export class ProjectController {
  #backend: ProjectBackend;
  #recent: RecentProjectsStore;
  #state: ProjectState;
  #listeners = new Set<(state: ProjectState) => void>();

  constructor(backend: ProjectBackend, recent: RecentProjectsStore) {
    this.#backend = backend;
    this.#recent = recent;
    this.#state = {
      project: null,
      activePath: null,
      content: '',
      savedContent: '',
      error: null,
      pending: null,
      recent: recent.list()
    };
  }

  /** The current state. */
  get state(): ProjectState {
    return this.#state;
  }

  /** Whether the open document has unsaved edits. */
  get isDirty(): boolean {
    return this.#state.activePath !== null && this.#state.content !== this.#state.savedContent;
  }

  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: (state: ProjectState) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #set(partial: Partial<ProjectState>): void {
    this.#state = { ...this.#state, ...partial };
    for (const listener of this.#listeners) {
      listener(this.#state);
    }
  }

  async #run(action: () => Promise<void>): Promise<void> {
    this.#set({ error: null });
    try {
      await action();
    } catch (err) {
      this.#set({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async #load(snapshot: ProjectSnapshot): Promise<void> {
    this.#recent.record({ root: snapshot.root, name: snapshot.name });
    this.#set({ project: snapshot, pending: null, recent: this.#recent.list() });
    if (snapshot.rootDocument !== '') {
      await this.#openFile(snapshot.root, snapshot.rootDocument);
    } else {
      this.#set({ activePath: null, content: '', savedContent: '' });
    }
  }

  async #openFile(root: string, path: string): Promise<void> {
    const content = await this.#backend.readDocument(root, path);
    this.#set({ activePath: path, content, savedContent: content });
  }

  /** Create a new project `name` inside `parent` and open it. */
  async createProject(parent: string, name: string): Promise<void> {
    await this.#run(async () => {
      await this.#load(await this.#backend.createProject(parent, name));
    });
  }

  /** Open an existing folder as a project. */
  async openFolder(path: string): Promise<void> {
    await this.#run(async () => {
      await this.#load(await this.#backend.openFolder(path));
    });
  }

  /** Pick a folder and open it as a project. */
  async pickAndOpen(): Promise<void> {
    await this.#run(async () => {
      const path = await this.#backend.pickFolder('Open a LaTeX project');
      if (path === null) {
        return;
      }
      await this.#load(await this.#backend.openFolder(path));
    });
  }

  /** Pick a parent directory and create a new project named `name` inside it. */
  async pickAndCreate(name: string): Promise<void> {
    await this.#run(async () => {
      const parent = await this.#backend.pickFolder('Choose where to create the project');
      if (parent === null) {
        return;
      }
      await this.#load(await this.#backend.createProject(parent, name));
    });
  }

  /**
   * Request to open `path`. If the open document has unsaved edits, this raises
   * the guard instead and remembers the request; otherwise it opens immediately.
   */
  async requestOpenFile(path: string): Promise<void> {
    const project = this.#state.project;
    if (project === null) {
      return;
    }
    if (this.isDirty && path !== this.#state.activePath) {
      this.#set({ pending: { label: `Open ${basename(path)}`, root: project.root, path } });
      return;
    }
    await this.#run(async () => {
      await this.#openFile(project.root, path);
    });
  }

  /** Update the editor contents. */
  edit(content: string): void {
    if (content === this.#state.content) {
      return;
    }
    this.#set({ content });
  }

  /** Save the open document. */
  async save(): Promise<void> {
    const project = this.#state.project;
    const path = this.#state.activePath;
    if (project === null || path === null) {
      return;
    }
    await this.#run(async () => {
      await this.#backend.saveDocument(project.root, path, this.#state.content);
      this.#set({ savedContent: this.#state.content });
    });
  }

  /** Resolve the guard by discarding edits and continuing the pending open. */
  async discardChanges(): Promise<void> {
    const pending = this.#state.pending;
    if (pending === null) {
      return;
    }
    this.#set({ pending: null });
    await this.#run(async () => {
      await this.#openFile(pending.root, pending.path);
    });
  }

  /** Resolve the guard by saving first, then continuing the pending open. */
  async saveAndContinue(): Promise<void> {
    const pending = this.#state.pending;
    if (pending === null) {
      return;
    }
    await this.save();
    if (this.#state.error !== null) {
      return;
    }
    this.#set({ pending: null });
    await this.#run(async () => {
      await this.#openFile(pending.root, pending.path);
    });
  }

  /** Dismiss the guard, keeping the current document. */
  cancelPending(): void {
    this.#set({ pending: null });
  }
}
