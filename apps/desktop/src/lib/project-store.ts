/**
 * The project controller: the single owner of "which project is open, which
 * document is showing, what has been edited, and what is unsaved". It drives the
 * sidebar, the editor, and the unsaved-changes guard.
 *
 * All of the decision logic lives here (not in the Svelte components) so it can
 * be tested directly against a fake {@link ProjectBackend}.
 */

import { type ProjectBackend, type ProjectSnapshot } from './project-backend';
import { type Diagnostic } from './diagnostics';
import { type RecentProject, RecentProjectsStore } from './recent-projects';
import { basename } from './file-tree';
import { type Timer, windowTimer } from './debounce';
import { type Clock, systemClock } from './timing';
import { type Bell, webAudioBell } from './bell';

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
  /** The state of the most recent compile. */
  compile: CompileState;
}

/** Where a compile currently stands. */
export type CompileStatus = 'idle' | 'running' | 'ok' | 'failed';

/** The result of the latest compile, driving the preview. */
export interface CompileState {
  /** Whether a compile is idle, running, succeeded, or failed. */
  status: CompileStatus;
  /** The TeX log from the last compile (empty until one runs). */
  log: string;
  /**
   * The PDF bytes currently on screen, or `null` when none yet. This holds the
   * last good proof across reruns — it is only replaced when a new proof has
   * been produced — so the preview never flickers to empty mid-build.
   */
  pdf: Uint8Array | null;
  /** How long the last completed build took, in milliseconds, or `null`. */
  durationMs: number | null;
  /** Whether the last completed build was served from the cache. */
  cached: boolean;
  /** Structured diagnostics from the last completed build. */
  diagnostics: Diagnostic[];
}

/** The starting compile state — nothing proofed yet. */
const IDLE_COMPILE: CompileState = {
  status: 'idle',
  log: '',
  pdf: null,
  durationMs: null,
  cached: false,
  diagnostics: []
};

/** How long to wait after the last edit before an auto-compile fires. */
const DEFAULT_DEBOUNCE_MS = 400;

/** Injectable timing/sound dependencies and compile preferences. */
export interface CompileDeps {
  /** The debounce timer for auto-compile (defaults to a real `setTimeout`). */
  timer?: Timer;
  /** The clock used to measure build duration (defaults to `performance`). */
  clock?: Clock;
  /** The success bell (defaults to a Web Audio bell). */
  bell?: Bell;
  /** Debounce delay in milliseconds. */
  debounceMs?: number;
  /** Whether to recompile automatically as the document changes. */
  autoCompile?: boolean;
  /** Whether to ring the bell when a build succeeds. */
  soundOnSuccess?: boolean;
}

/** Owns project state and notifies subscribers on every change. */
export class ProjectController {
  #backend: ProjectBackend;
  #recent: RecentProjectsStore;
  #state: ProjectState;
  #listeners = new Set<(state: ProjectState) => void>();
  #timer: Timer;
  #clock: Clock;
  #bell: Bell;
  #debounceMs: number;
  #autoCompile: boolean;
  #soundOnSuccess: boolean;
  // A monotonic id stamped on each compile so a stale build that finishes after
  // a newer one started can be dropped instead of overwriting the fresh proof.
  #compileGeneration = 0;

  constructor(backend: ProjectBackend, recent: RecentProjectsStore, deps: CompileDeps = {}) {
    this.#backend = backend;
    this.#recent = recent;
    this.#timer = deps.timer ?? windowTimer();
    this.#clock = deps.clock ?? systemClock();
    this.#bell = deps.bell ?? webAudioBell();
    this.#debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.#autoCompile = deps.autoCompile ?? true;
    this.#soundOnSuccess = deps.soundOnSuccess ?? false;
    this.#state = {
      project: null,
      activePath: null,
      content: '',
      savedContent: '',
      error: null,
      pending: null,
      recent: recent.list(),
      compile: IDLE_COMPILE
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

  /** Merge a partial change into the compile slice, leaving other fields as-is. */
  #setCompile(partial: Partial<CompileState>): void {
    this.#set({ compile: { ...this.#state.compile, ...partial } });
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
    // Cancel any pending auto-compile and retire any in-flight build, so a proof
    // from the previous project can never land on the new one.
    this.#timer.clear();
    this.#compileGeneration += 1;
    this.#recent.record({ root: snapshot.root, name: snapshot.name });
    // A freshly loaded project starts with no proof on the galley.
    this.#set({
      project: snapshot,
      pending: null,
      recent: this.#recent.list(),
      compile: IDLE_COMPILE
    });
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

  /** Update the editor contents, scheduling a debounced auto-compile. */
  edit(content: string): void {
    if (content === this.#state.content) {
      return;
    }
    this.#set({ content });
    if (this.#autoCompile && this.#state.activePath !== null) {
      this.#timer.set(() => void this.compile(), this.#debounceMs);
    }
  }

  /** Enable or disable compile-as-you-type; disabling cancels any pending run. */
  setAutoCompile(enabled: boolean): void {
    this.#autoCompile = enabled;
    if (!enabled) {
      this.#timer.clear();
    }
  }

  /** Enable or disable the success bell. */
  setSoundOnSuccess(enabled: boolean): void {
    this.#soundOnSuccess = enabled;
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

  /**
   * Compile the open document and surface the result for the preview.
   *
   * Galley compiles the editor's canonical source directly (§0.5) — it does not
   * force a save first, so dirty tracking stays meaningful and auto-compile can
   * preview unsaved work; persisting is the separate, explicit save action. The
   * previous proof stays on screen until a new one is produced (no flicker), and
   * a build superseded by a newer one is dropped rather than allowed to overwrite
   * the fresh proof. (For v0.1.1 the open document is the build root; multi-file
   * root awareness lands with the language server in v0.2.1.)
   */
  async compile(): Promise<void> {
    const project = this.#state.project;
    const path = this.#state.activePath;
    if (project === null || path === null) {
      return;
    }
    // An explicit compile pre-empts any pending auto-compile.
    this.#timer.clear();
    const generation = ++this.#compileGeneration;
    this.#set({ error: null });
    this.#setCompile({ status: 'running' });
    const start = this.#clock.now();

    let next: Partial<CompileState> | { error: string };
    try {
      const outcome = await this.#backend.compile(this.#state.content, path);
      const durationMs = this.#clock.now() - start;
      next = outcome.ok
        ? {
            status: 'ok',
            log: outcome.log,
            pdf: outcome.pdf,
            durationMs,
            cached: outcome.cached,
            diagnostics: outcome.diagnostics
          }
        : // A failed build keeps the last good proof on screen; the status, log,
          // timing and diagnostics change.
          {
            status: 'failed',
            log: outcome.log,
            durationMs,
            cached: outcome.cached,
            diagnostics: outcome.diagnostics
          };
    } catch (err) {
      next = { error: err instanceof Error ? err.message : String(err) };
    }

    // A newer compile started while this one was running — drop this result.
    if (generation !== this.#compileGeneration) {
      return;
    }
    if ('error' in next) {
      this.#set({ error: next.error });
      this.#setCompile({ status: 'failed' });
      return;
    }
    const succeeded = next.status === 'ok';
    this.#setCompile(next);
    if (succeeded && this.#soundOnSuccess) {
      this.#bell.ding();
    }
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
