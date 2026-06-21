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
import {
  type DefinitionLocation,
  type DocumentSymbol,
  type LanguageBackend,
  resolveDefinition
} from './language-backend';
import { type RecentProject, RecentProjectsStore } from './recent-projects';
import { basename, classifyKind } from './file-tree';
import {
  type BibEntry,
  type CiteCandidate,
  parseBib,
  serializeBib,
  serializeEntry,
  citeCandidates as buildCiteCandidates
} from './bibliography';
import { type BibBackend, type LookupKind } from './bib-backend';
import { type Timer, windowTimer } from './debounce';
import { adaptiveDebounceMs } from './perf-budget';
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
  /** Live diagnostics from the language server (ChkTeX/analysis). */
  lspDiagnostics: Diagnostic[];
  /** The document outline from the language server. */
  symbols: DocumentSymbol[];
  /** Every bibliography entry parsed from the project's `.bib` files. */
  bibEntries: BibEntry[];
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
  /** The language-server backend, for live diagnostics and the document outline. */
  language?: LanguageBackend;
  /** The reference-lookup backend, for resolving DOIs and arXiv ids. */
  bib?: BibBackend;
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
  #language: LanguageBackend | null;
  #bib: BibBackend | null;
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
    this.#language = deps.language ?? null;
    this.#bib = deps.bib ?? null;
    this.#state = {
      project: null,
      activePath: null,
      content: '',
      savedContent: '',
      error: null,
      pending: null,
      recent: recent.list(),
      compile: IDLE_COMPILE,
      lspDiagnostics: [],
      symbols: [],
      bibEntries: []
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
    // A freshly loaded project starts with no proof on the galley and no
    // carried-over language results.
    this.#set({
      project: snapshot,
      pending: null,
      recent: this.#recent.list(),
      compile: IDLE_COMPILE,
      lspDiagnostics: [],
      symbols: [],
      bibEntries: []
    });
    if (snapshot.rootDocument !== '') {
      await this.#openFile(snapshot.root, snapshot.rootDocument);
    } else {
      this.#set({ activePath: null, content: '', savedContent: '' });
    }
    await this.#loadBibliography(snapshot);
  }

  /** The project's primary `.bib` file — the first one, or a default name. */
  #bibPath(project: ProjectSnapshot): string {
    const existing = project.documents.find((doc) => doc.path.endsWith('.bib'));
    return existing === undefined ? 'references.bib' : existing.path;
  }

  /** Read a `.bib` file, treating a missing file as empty content. */
  async #readBibOrEmpty(root: string, path: string): Promise<string> {
    try {
      return await this.#backend.readDocument(root, path);
    } catch {
      return '';
    }
  }

  /** Parse every `.bib` file in `project` into the entry list. Best-effort: an
   * unreadable file is skipped so the rest still load. */
  async #loadBibliography(project: ProjectSnapshot): Promise<void> {
    const entries: BibEntry[] = [];
    for (const doc of project.documents) {
      if (!doc.path.endsWith('.bib')) {
        continue;
      }
      try {
        entries.push(...parseBib(await this.#backend.readDocument(project.root, doc.path)));
      } catch {
        // An unreadable `.bib` is skipped; the rest still load.
      }
    }
    this.#set({ bibEntries: entries });
  }

  /** Add `path` to the project's document list when it is not already there,
   * returning the (possibly updated) project so callers reload from it. */
  #ensureBibDocument(project: ProjectSnapshot, path: string): ProjectSnapshot {
    if (project.documents.some((doc) => doc.path === path)) {
      return project;
    }
    const updated: ProjectSnapshot = {
      ...project,
      documents: [...project.documents, { path, kind: classifyKind(path) }]
    };
    this.#set({ project: updated });
    return updated;
  }

  /** Citation candidates (key + summary) for the editor and the bibliography
   * panel, derived from the parsed entries. */
  citeCandidates(): CiteCandidate[] {
    return buildCiteCandidates(this.#state.bibEntries);
  }

  /**
   * Look up `query` (a DOI or arXiv id) and append the resolved entry to the
   * project's `.bib` file, reloading the bibliography. Returns the new citation
   * key, or `null` when no lookup backend is configured or no project is open.
   */
  async addReference(query: string, kind: LookupKind): Promise<string | null> {
    const project = this.#state.project;
    const bib = this.#bib;
    if (project === null || bib === null) {
      return null;
    }
    let key: string | null = null;
    await this.#run(async () => {
      const entry = await bib.lookupReference(query, kind);
      const path = this.#bibPath(project);
      const existing = await this.#readBibOrEmpty(project.root, path);
      const block = serializeEntry(entry);
      const next = existing.trim() === '' ? block : `${existing.trimEnd()}\n\n${block}`;
      await this.#backend.saveDocument(project.root, path, next);
      await this.#loadBibliography(this.#ensureBibDocument(project, path));
      key = entry.key;
    });
    return key;
  }

  /**
   * Merge the entries in `content` (a `.bib` export, e.g. from Zotero) into the
   * project's `.bib` file, skipping keys that already exist. Returns the number
   * of entries added.
   */
  async importBibText(content: string): Promise<number> {
    const project = this.#state.project;
    if (project === null) {
      return 0;
    }
    let added = 0;
    await this.#run(async () => {
      const path = this.#bibPath(project);
      const current = parseBib(await this.#readBibOrEmpty(project.root, path));
      const seen = new Set(current.map((entry) => entry.key));
      const fresh = parseBib(content).filter((entry) => !seen.has(entry.key));
      if (fresh.length === 0) {
        return;
      }
      await this.#backend.saveDocument(project.root, path, serializeBib([...current, ...fresh]));
      await this.#loadBibliography(this.#ensureBibDocument(project, path));
      added = fresh.length;
    });
    return added;
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
   * Pick a parent directory, create a new project named `name`, seed `main.tex`
   * with `body`, and open it. This is the "New from template" flow.
   */
  async pickAndCreateFromTemplate(name: string, body: string): Promise<void> {
    await this.#run(async () => {
      const parent = await this.#backend.pickFolder('Choose where to create the project');
      if (parent === null) {
        return;
      }
      const snapshot = await this.#backend.createProject(parent, name);
      await this.#backend.saveDocument(snapshot.root, 'main.tex', body);
      await this.#load(snapshot);
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
      // Scale the debounce to document size so a large document coalesces a
      // burst of keystrokes into one build instead of recompiling each time.
      const delayMs = Math.max(this.#debounceMs, adaptiveDebounceMs(content.length));
      this.#timer.set(() => void this.compile(), delayMs);
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
   * the fresh proof.
   *
   * When the project has a root document configured, that file is used as the
   * compile target so editing any included file proofs the whole document. When
   * the active file is not the root, the root is read from disk — unsaved edits
   * to the active file are not visible until saved (ADR-0010).
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
    // Use the project root document as the compile target when configured;
    // fall back to the active path for single-file projects (ADR-0010).
    const rootDoc = project.rootDocument !== '' ? project.rootDocument : path;

    let next: Partial<CompileState> | { error: string };
    try {
      // When editing an included file, read the root file from disk so Tectonic
      // gets the correct primary input; \input-ed files are then resolved from disk.
      const source =
        rootDoc !== path
          ? await this.#backend.readDocument(project.root, rootDoc)
          : this.#state.content;
      const outcome = await this.#backend.compile(source, rootDoc, project.root);
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
    await this.#refreshLanguage(generation);
  }

  /**
   * Refresh the language server's diagnostics and the document outline for the
   * current document. Best-effort: any failure (including no server configured)
   * leaves the previous results untouched, and a result superseded by a newer
   * compile is dropped, like the proof itself.
   */
  async #refreshLanguage(generation: number): Promise<void> {
    const language = this.#language;
    const project = this.#state.project;
    const path = this.#state.activePath;
    if (language === null || project === null || path === null) {
      return;
    }
    const source = this.#state.content;
    try {
      const [lspDiagnostics, symbols] = await Promise.all([
        language.diagnostics(project.root, path, source),
        language.symbols(project.root, path, source)
      ]);
      if (generation !== this.#compileGeneration) {
        return;
      }
      this.#set({ lspDiagnostics, symbols });
    } catch {
      // Language features are best-effort; the compile path already surfaced any
      // hard error, so a server hiccup must not disturb the proof or the editor.
    }
  }

  /** The open document's project root and relative path, or `null` when none. */
  currentDocument(): { root: string; rel: string } | null {
    const project = this.#state.project;
    const path = this.#state.activePath;
    if (project === null || path === null) {
      return null;
    }
    return { root: project.root, rel: path };
  }

  /**
   * Navigate to a definition: resolve the target to a project file, open it when
   * it differs from the current document, and reveal the line via `reveal` (a
   * one-based line, ready for the editor). Does nothing when there is no project
   * to resolve against.
   */
  async goToDefinition(
    location: DefinitionLocation,
    reveal: (line: number) => void
  ): Promise<void> {
    const target = resolveDefinition(location, this.#state.project);
    if (target === null) {
      return;
    }
    if (target.rel !== this.#state.activePath) {
      await this.requestOpenFile(target.rel);
    }
    // Definition lines are zero-based (LSP); the editor reveals one-based.
    reveal(target.line + 1);
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
