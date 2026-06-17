import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectController } from '../src/lib/project-store';
import {
  type CompileOutcome,
  type ProjectBackend,
  type ProjectSnapshot
} from '../src/lib/project-backend';
import { RecentProjectsStore } from '../src/lib/recent-projects';

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
  compileResult: CompileOutcome = { ok: true, log: 'Output written.', pdf: new Uint8Array([1, 2]) };
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

  async compile(source: string, rootDocument: string): Promise<CompileOutcome> {
    this.compileCalls.push({ source, rootDocument });
    return this.compileResult;
  }

  async pickFolder(): Promise<string | null> {
    return this.pick;
  }
}

let backend: FakeBackend;
let controller: ProjectController;

function makeRecent() {
  const map = new Map<string, string>();
  return new RecentProjectsStore({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value)
  });
}

beforeEach(() => {
  backend = new FakeBackend();
  controller = new ProjectController(backend, makeRecent());
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
    const fresh = new ProjectController(backend, makeRecent());
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
    const fresh = new ProjectController(backend, makeRecent());
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
    // Still on the original document.
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

  it('saves the source first, then compiles it and stores the proof', async () => {
    controller.edit('\\documentclass{article}');
    await controller.compile();
    // The active source was saved before compiling (canonical on disk).
    expect(backend.files.get('main.tex')).toBe('\\documentclass{article}');
    expect(controller.isDirty).toBe(false);
    expect(backend.compileCalls).toEqual([
      { source: '\\documentclass{article}', rootDocument: 'main.tex' }
    ]);
    expect(controller.state.compile.status).toBe('ok');
    expect(controller.state.compile.log).toBe('Output written.');
    expect(controller.state.compile.pdf).toEqual(new Uint8Array([1, 2]));
  });

  it('records a failed compile with its log and no PDF', async () => {
    backend.compileResult = { ok: false, log: '! Undefined control sequence.', pdf: null };
    await controller.compile();
    expect(controller.state.compile.status).toBe('failed');
    expect(controller.state.compile.log).toContain('Undefined control sequence');
    expect(controller.state.compile.pdf).toBeNull();
  });

  it('does nothing without a project', async () => {
    const fresh = new ProjectController(backend, makeRecent());
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
});
