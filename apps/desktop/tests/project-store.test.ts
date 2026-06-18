import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectController, type CompileDeps } from '../src/lib/project-store';
import {
  type CompileOutcome,
  type ProjectBackend,
  type ProjectSnapshot
} from '../src/lib/project-backend';
import { RecentProjectsStore } from '../src/lib/recent-projects';
import type { Timer } from '../src/lib/debounce';
import type { Clock } from '../src/lib/timing';
import type { Bell } from '../src/lib/bell';
import type { DocumentSymbol, LanguageBackend } from '../src/lib/language-backend';
import type { Diagnostic } from '../src/lib/diagnostics';

function snapshot(over: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    name: 'Demo',
    root: '/p',
    rootDocument: 'main.tex',
    documents: [
      { path: 'main.tex', kind: 'tex' },
      { path: 'intro.tex', kind: 'tex' }
    ],
    ...over
  };
}

/** A promise whose resolution a test controls, for stale-build ordering. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function ok(over: Partial<CompileOutcome> = {}): CompileOutcome {
  return {
    ok: true,
    log: 'Output written.',
    pdf: new Uint8Array([1, 2]),
    cached: false,
    diagnostics: [],
    ...over
  };
}

class FakeBackend implements ProjectBackend {
  files = new Map<string, string>([
    ['main.tex', 'original main'],
    ['intro.tex', 'original intro']
  ]);
  createResult: ProjectSnapshot = snapshot();
  openResult: ProjectSnapshot = snapshot();
  pick: string | null = '/picked';
  createError: unknown = null;
  openError: unknown = null;
  saveError: unknown = null;
  compileResult: CompileOutcome = ok();
  compileError: unknown = null;
  /** Queued deferred results; when present, each compile takes the next one. */
  compileQueue: Array<Promise<CompileOutcome>> = [];
  compileCalls: Array<{ source: string; rootDocument: string }> = [];

  async createProject(parent: string, name: string): Promise<ProjectSnapshot> {
    if (this.createError !== null) {
      throw this.createError;
    }
    return { ...this.createResult, root: `${parent}/${name}`, name };
  }

  async openFolder(path: string): Promise<ProjectSnapshot> {
    if (this.openError !== null) {
      throw this.openError;
    }
    return { ...this.openResult, root: path };
  }

  async readDocument(_root: string, rel: string): Promise<string> {
    const contents = this.files.get(rel);
    if (contents === undefined) {
      throw new Error(`missing ${rel}`);
    }
    return contents;
  }

  async saveDocument(_root: string, rel: string, contents: string): Promise<void> {
    if (this.saveError !== null) {
      throw this.saveError;
    }
    this.files.set(rel, contents);
  }

  compile(source: string, rootDocument: string): Promise<CompileOutcome> {
    this.compileCalls.push({ source, rootDocument });
    if (this.compileError !== null) {
      return Promise.reject(this.compileError);
    }
    if (this.compileQueue.length > 0) {
      return this.compileQueue.shift()!;
    }
    return Promise.resolve(this.compileResult);
  }

  async pickFolder(): Promise<string | null> {
    return this.pick;
  }
}

/** A debounce timer a test fires by hand. */
class FakeTimer implements Timer {
  pending: (() => void) | null = null;
  clears = 0;
  set(callback: () => void): void {
    this.pending = callback;
  }
  clear(): void {
    this.pending = null;
    this.clears += 1;
  }
  fire(): void {
    const run = this.pending;
    this.pending = null;
    run?.();
  }
}

/** A clock returning queued times, then holding the last one. */
class FakeClock implements Clock {
  times: number[] = [];
  #last = 0;
  now(): number {
    if (this.times.length > 0) {
      this.#last = this.times.shift()!;
    }
    return this.#last;
  }
}

let backend: FakeBackend;
let controller: ProjectController;
let timer: FakeTimer;
let clock: FakeClock;
let bell: Bell & { ding: ReturnType<typeof vi.fn> };

function makeRecent() {
  const map = new Map<string, string>();
  return new RecentProjectsStore({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value)
  });
}

function makeController(deps: Partial<CompileDeps> = {}) {
  return new ProjectController(backend, makeRecent(), { timer, clock, bell, ...deps });
}

beforeEach(() => {
  backend = new FakeBackend();
  timer = new FakeTimer();
  clock = new FakeClock();
  bell = { ding: vi.fn() };
  controller = makeController();
});

describe('ProjectController — opening and creating', () => {
  it('starts empty', () => {
    expect(controller.state.project).toBeNull();
    expect(controller.state.activePath).toBeNull();
    expect(controller.isDirty).toBe(false);
  });

  it('creates a project, opens the root document, and records it', async () => {
    const seen: number[] = [];
    const unsubscribe = controller.subscribe((state) => seen.push(state.recent.length));
    await controller.createProject('/parent', 'Paper');
    unsubscribe();

    expect(controller.state.project?.name).toBe('Paper');
    expect(controller.state.activePath).toBe('main.tex');
    expect(controller.state.content).toBe('original main');
    expect(controller.state.recent).toEqual([{ root: '/parent/Paper', name: 'Paper' }]);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('opens a folder with no root document, leaving the editor empty', async () => {
    backend.openResult = snapshot({ rootDocument: '' });
    await controller.openFolder('/somewhere');
    expect(controller.state.project?.root).toBe('/somewhere');
    expect(controller.state.activePath).toBeNull();
    expect(controller.state.content).toBe('');
  });

  it('surfaces an Error from create', async () => {
    backend.createError = new Error('disk full');
    await controller.createProject('/parent', 'X');
    expect(controller.state.error).toBe('disk full');
    expect(controller.state.project).toBeNull();
  });

  it('surfaces a non-Error rejection from open', async () => {
    backend.openError = 'just a string';
    await controller.openFolder('/x');
    expect(controller.state.error).toBe('just a string');
  });

  it('surfaces a failure to read the root document', async () => {
    backend.openResult = snapshot({ rootDocument: 'ghost.tex' });
    await controller.openFolder('/x');
    expect(controller.state.error).toBe('missing ghost.tex');
  });
});

describe('ProjectController — picking', () => {
  it('pickAndOpen opens the chosen folder', async () => {
    backend.pick = '/chosen';
    await controller.pickAndOpen();
    expect(controller.state.project?.root).toBe('/chosen');
  });

  it('pickAndOpen does nothing when cancelled', async () => {
    backend.pick = null;
    await controller.pickAndOpen();
    expect(controller.state.project).toBeNull();
  });

  it('pickAndCreate creates in the chosen parent', async () => {
    backend.pick = '/parent';
    await controller.pickAndCreate('New');
    expect(controller.state.project?.root).toBe('/parent/New');
  });

  it('pickAndCreate does nothing when cancelled', async () => {
    backend.pick = null;
    await controller.pickAndCreate('New');
    expect(controller.state.project).toBeNull();
  });
});

describe('ProjectController — editing, dirty tracking and saving', () => {
  beforeEach(async () => {
    await controller.createProject('/parent', 'Paper');
  });

  it('tracks dirtiness only when the content differs', () => {
    expect(controller.isDirty).toBe(false);
    controller.edit('original main'); // unchanged → no-op
    expect(controller.isDirty).toBe(false);
    controller.edit('changed');
    expect(controller.isDirty).toBe(true);
  });

  it('saves the document and clears dirtiness', async () => {
    controller.edit('changed');
    await controller.save();
    expect(controller.isDirty).toBe(false);
    expect(backend.files.get('main.tex')).toBe('changed');
  });

  it('save is a no-op with no active document', async () => {
    const fresh = makeController();
    await fresh.save();
    expect(fresh.state.error).toBeNull();
  });

  it('surfaces a save failure', async () => {
    backend.saveError = new Error('read-only');
    controller.edit('changed');
    await controller.save();
    expect(controller.state.error).toBe('read-only');
    expect(controller.isDirty).toBe(true);
  });

  it('re-opening the active file while dirty just reloads it', async () => {
    controller.edit('changed');
    await controller.requestOpenFile('main.tex');
    expect(controller.state.pending).toBeNull();
    expect(controller.state.content).toBe('original main');
  });
});

describe('ProjectController — the unsaved-changes guard', () => {
  beforeEach(async () => {
    await controller.createProject('/parent', 'Paper');
  });

  it('does nothing when there is no project', async () => {
    const fresh = makeController();
    await fresh.requestOpenFile('main.tex');
    expect(fresh.state.activePath).toBeNull();
  });

  it('opens directly when the document is clean', async () => {
    await controller.requestOpenFile('intro.tex');
    expect(controller.state.activePath).toBe('intro.tex');
    expect(controller.state.pending).toBeNull();
  });

  it('raises the guard when switching away from unsaved edits', async () => {
    controller.edit('changed');
    await controller.requestOpenFile('intro.tex');
    expect(controller.state.pending).toEqual({
      label: 'Open intro.tex',
      root: '/parent/Paper',
      path: 'intro.tex'
    });
    expect(controller.state.activePath).toBe('main.tex');
  });

  it('discards changes and continues', async () => {
    controller.edit('changed');
    await controller.requestOpenFile('intro.tex');
    await controller.discardChanges();
    expect(controller.state.activePath).toBe('intro.tex');
    expect(controller.state.content).toBe('original intro');
    expect(controller.state.pending).toBeNull();
  });

  it('saves then continues', async () => {
    controller.edit('changed');
    await controller.requestOpenFile('intro.tex');
    await controller.saveAndContinue();
    expect(backend.files.get('main.tex')).toBe('changed');
    expect(controller.state.activePath).toBe('intro.tex');
    expect(controller.state.pending).toBeNull();
  });

  it('keeps the guard up when the save fails', async () => {
    controller.edit('changed');
    await controller.requestOpenFile('intro.tex');
    backend.saveError = new Error('nope');
    await controller.saveAndContinue();
    expect(controller.state.pending).not.toBeNull();
    expect(controller.state.activePath).toBe('main.tex');
  });

  it('cancels the guard, keeping the current document', async () => {
    controller.edit('changed');
    await controller.requestOpenFile('intro.tex');
    controller.cancelPending();
    expect(controller.state.pending).toBeNull();
    expect(controller.state.activePath).toBe('main.tex');
  });

  it('discardChanges and saveAndContinue are no-ops without a pending guard', async () => {
    await controller.discardChanges();
    await controller.saveAndContinue();
    expect(controller.state.activePath).toBe('main.tex');
  });
});

describe('ProjectController — compiling', () => {
  beforeEach(async () => {
    await controller.createProject('/parent', 'Paper');
  });

  it('compiles the canonical buffer without saving and stores the proof', async () => {
    controller.edit('\\documentclass{article}');
    clock.times = [100, 142];
    await controller.compile();
    // Compile does NOT persist — the buffer stays dirty, the file unchanged.
    expect(backend.files.get('main.tex')).toBe('original main');
    expect(controller.isDirty).toBe(true);
    expect(backend.compileCalls).toEqual([
      { source: '\\documentclass{article}', rootDocument: 'main.tex' }
    ]);
    expect(controller.state.compile.status).toBe('ok');
    expect(controller.state.compile.log).toBe('Output written.');
    expect(controller.state.compile.pdf).toEqual(new Uint8Array([1, 2]));
    expect(controller.state.compile.durationMs).toBe(42);
    expect(controller.state.compile.cached).toBe(false);
  });

  it('marks a cache hit as cached', async () => {
    backend.compileResult = ok({ cached: true });
    await controller.compile();
    expect(controller.state.compile.cached).toBe(true);
  });

  it('carries diagnostics from a successful build (e.g. warnings)', async () => {
    backend.compileResult = ok({
      diagnostics: [
        {
          severity: 'warning',
          kind: 'undefined-reference',
          message: 'Reference undefined',
          file: null,
          line: 9,
          explanation: 'That \\ref points at a missing label.'
        }
      ]
    });
    await controller.compile();
    expect(controller.state.compile.status).toBe('ok');
    expect(controller.state.compile.diagnostics).toHaveLength(1);
    expect(controller.state.compile.diagnostics[0].severity).toBe('warning');
  });

  it('records a failed compile and, on the first build, shows no proof', async () => {
    backend.compileResult = {
      ok: false,
      log: '! Undefined control sequence.',
      pdf: null,
      cached: false,
      diagnostics: [
        {
          severity: 'error',
          kind: 'undefined-control-sequence',
          message: 'Undefined control sequence \\foo',
          file: null,
          line: 6,
          explanation: 'That command is not one LaTeX knows.'
        }
      ]
    };
    await controller.compile();
    expect(controller.state.compile.status).toBe('failed');
    expect(controller.state.compile.log).toContain('Undefined control sequence');
    expect(controller.state.compile.pdf).toBeNull();
    // The parsed diagnostics ride along on the compile slice.
    expect(controller.state.compile.diagnostics).toHaveLength(1);
    expect(controller.state.compile.diagnostics[0].line).toBe(6);
  });

  it('keeps the last good proof on screen when a later build fails', async () => {
    await controller.compile(); // succeeds, proof shown
    expect(controller.state.compile.pdf).toEqual(new Uint8Array([1, 2]));
    backend.compileResult = { ok: false, log: 'broken', pdf: null, cached: false, diagnostics: [] };
    await controller.compile();
    expect(controller.state.compile.status).toBe('failed');
    expect(controller.state.compile.log).toBe('broken');
    // The previous proof is still on screen — no flicker to empty.
    expect(controller.state.compile.pdf).toEqual(new Uint8Array([1, 2]));
  });

  it('does nothing without a project', async () => {
    const fresh = makeController();
    await fresh.compile();
    expect(fresh.state.compile.status).toBe('idle');
  });

  it('does nothing when a project has no open document', async () => {
    backend.openResult = snapshot({ rootDocument: '' });
    await controller.openFolder('/empty');
    expect(controller.state.activePath).toBeNull();
    await controller.compile();
    expect(controller.state.compile.status).toBe('idle');
  });

  it('clears a stale proof when another project is opened', async () => {
    await controller.compile();
    expect(controller.state.compile.status).toBe('ok');
    await controller.openFolder('/another');
    expect(controller.state.compile.status).toBe('idle');
    expect(controller.state.compile.pdf).toBeNull();
  });

  it('surfaces an Error thrown by the backend as a failed build', async () => {
    backend.compileError = new Error('ipc died');
    await controller.compile();
    expect(controller.state.error).toBe('ipc died');
    expect(controller.state.compile.status).toBe('failed');
  });

  it('surfaces a non-Error rejection from the backend', async () => {
    backend.compileError = 'boom';
    await controller.compile();
    expect(controller.state.error).toBe('boom');
    expect(controller.state.compile.status).toBe('failed');
  });

  it('drops a stale build so it cannot overwrite a newer proof', async () => {
    const first = deferred<CompileOutcome>();
    const second = deferred<CompileOutcome>();
    backend.compileQueue = [first.promise, second.promise];

    const p1 = controller.compile(); // generation 1
    const p2 = controller.compile(); // generation 2 — supersedes 1

    first.resolve(ok({ log: 'stale', pdf: new Uint8Array([9]) }));
    await p1;
    // The stale build was dropped; we are still waiting on the newer one.
    expect(controller.state.compile.status).toBe('running');

    second.resolve(ok({ log: 'fresh', pdf: new Uint8Array([7]) }));
    await p2;
    expect(controller.state.compile.log).toBe('fresh');
    expect(controller.state.compile.pdf).toEqual(new Uint8Array([7]));
  });
});

describe('ProjectController — auto-compile and the bell', () => {
  beforeEach(async () => {
    await controller.createProject('/parent', 'Paper');
  });

  it('debounces edits into a single compile when the timer fires', async () => {
    controller.edit('first');
    controller.edit('second'); // replaces the pending compile
    expect(backend.compileCalls).toEqual([]);
    timer.fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.compileCalls).toEqual([{ source: 'second', rootDocument: 'main.tex' }]);
  });

  it('does not schedule an auto-compile when disabled', () => {
    const manual = makeController({ autoCompile: false });
    void manual.createProject('/p', 'P');
    manual.edit('typing');
    expect(timer.pending).toBeNull();
  });

  it('cancels any pending auto-compile when disabled mid-stream', () => {
    controller.edit('typing');
    expect(timer.pending).not.toBeNull();
    controller.setAutoCompile(false);
    expect(timer.pending).toBeNull();
    controller.setAutoCompile(true); // re-enabling does not re-arm on its own
    expect(timer.pending).toBeNull();
  });

  it('does not auto-schedule when there is no open document', async () => {
    backend.openResult = snapshot({ rootDocument: '' });
    await controller.openFolder('/empty');
    controller.edit('typed into nothing');
    expect(timer.pending).toBeNull();
  });

  it('rings the bell on success only when sound is enabled', async () => {
    controller.setSoundOnSuccess(true);
    await controller.compile();
    expect(bell.ding).toHaveBeenCalledOnce();
  });

  it('stays silent on success when sound is disabled', async () => {
    await controller.compile();
    expect(bell.ding).not.toHaveBeenCalled();
  });

  it('does not ring on a failed build even with sound enabled', async () => {
    controller.setSoundOnSuccess(true);
    backend.compileResult = { ok: false, log: 'no', pdf: null, cached: false, diagnostics: [] };
    await controller.compile();
    expect(bell.ding).not.toHaveBeenCalled();
  });

  it('uses real defaults when no deps are injected', () => {
    // Exercises the default timer/clock/bell/preferences in the constructor.
    const plain = new ProjectController(backend, makeRecent());
    expect(plain.state.compile.status).toBe('idle');
  });
});

describe('ProjectController — language features', () => {
  const styleDiag: Diagnostic = {
    severity: 'warning',
    kind: 'style',
    message: 'Command terminated with space.',
    file: null,
    line: 2,
    explanation: 'A style note from ChkTeX.'
  };
  const symbol: DocumentSymbol = {
    name: 'Intro',
    detail: 'sec:intro',
    kind: 'section',
    line: 0,
    children: []
  };

  function fakeLanguage(over: Partial<LanguageBackend> = {}): LanguageBackend {
    return {
      completion: async () => [],
      hover: async () => null,
      definition: async () => null,
      symbols: async () => [],
      diagnostics: async () => [],
      ...over
    };
  }

  it('does no language work when no backend is configured', async () => {
    await controller.openFolder('/p');
    await controller.compile();
    expect(controller.state.lspDiagnostics).toEqual([]);
    expect(controller.state.symbols).toEqual([]);
  });

  it('refreshes diagnostics and the outline after a compile', async () => {
    const language = fakeLanguage({
      diagnostics: async () => [styleDiag],
      symbols: async () => [symbol]
    });
    controller = makeController({ language });
    await controller.openFolder('/p');
    await controller.compile();
    expect(controller.state.lspDiagnostics).toEqual([styleDiag]);
    expect(controller.state.symbols).toEqual([symbol]);
  });

  it('treats language failures as best-effort, surfacing no error', async () => {
    const language = fakeLanguage({
      diagnostics: async () => {
        throw new Error('lsp down');
      }
    });
    controller = makeController({ language });
    await controller.openFolder('/p');
    await controller.compile();
    expect(controller.state.lspDiagnostics).toEqual([]);
    expect(controller.state.error).toBeNull();
  });

  it('drops a stale language refresh superseded by a newer compile', async () => {
    const diagA: Diagnostic = { ...styleDiag, message: 'stale A' };
    const diagB: Diagnostic = { ...styleDiag, message: 'fresh B' };
    const results = [[diagA], [diagB]];
    let call = 0;
    let reentered = false;
    const language = fakeLanguage({
      diagnostics: async () => {
        const mine = results[call] ?? [];
        call += 1;
        if (!reentered) {
          reentered = true;
          // A newer compile lands while this refresh is in flight.
          await controller.compile();
        }
        return mine;
      }
    });
    controller = makeController({ language });
    await controller.openFolder('/p');
    await controller.compile();
    expect(call).toBe(2);
    // The first (stale) refresh was dropped; the newer one's result stands.
    expect(controller.state.lspDiagnostics).toEqual([diagB]);
  });

  it('clears language results when a new project loads', async () => {
    const language = fakeLanguage({
      diagnostics: async () => [styleDiag],
      symbols: async () => [symbol]
    });
    controller = makeController({ language });
    await controller.openFolder('/p');
    await controller.compile();
    expect(controller.state.lspDiagnostics).toHaveLength(1);
    await controller.openFolder('/q');
    expect(controller.state.lspDiagnostics).toEqual([]);
    expect(controller.state.symbols).toEqual([]);
  });

  it('reports the open document, or null when none is open', async () => {
    expect(controller.currentDocument()).toBeNull();
    await controller.openFolder('/p');
    expect(controller.currentDocument()).toEqual({ root: '/p', rel: 'main.tex' });
  });

  it('navigates to a definition, opening another file when it differs', async () => {
    controller = makeController({ language: fakeLanguage() });
    await controller.openFolder('/p');
    const reveal = vi.fn();
    // Same file: reveals the one-based line, stays put.
    await controller.goToDefinition({ file: 'main.tex', line: 4, character: 0 }, reveal);
    expect(reveal).toHaveBeenLastCalledWith(5);
    expect(controller.state.activePath).toBe('main.tex');
    // Cross-file: resolves the URI to a project path and opens it.
    await controller.goToDefinition({ file: '/p/intro.tex', line: 2, character: 0 }, reveal);
    expect(reveal).toHaveBeenLastCalledWith(3);
    expect(controller.state.activePath).toBe('intro.tex');
  });

  it('does not reveal when no project is open', async () => {
    const plain = new ProjectController(backend, makeRecent(), { language: fakeLanguage() });
    const reveal = vi.fn();
    await plain.goToDefinition({ file: 'x', line: 0, character: 0 }, reveal);
    expect(reveal).not.toHaveBeenCalled();
  });
});
