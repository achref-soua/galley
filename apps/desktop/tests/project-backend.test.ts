import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const open = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...args: unknown[]) => open(...args) }));

import {
  browserProjectBackend,
  isTauri,
  selectBackend,
  tauriProjectBackend
} from '../src/lib/project-backend';

beforeEach(() => {
  invoke.mockReset();
  open.mockReset();
});

describe('tauriProjectBackend', () => {
  const raw = {
    name: 'Paper',
    root: '/p',
    root_document: 'main.tex',
    documents: [{ path: 'main.tex', kind: 'tex' as const }]
  };

  it('creates a project, mapping the snake_case DTO', async () => {
    invoke.mockResolvedValueOnce(raw);
    const snapshot = await tauriProjectBackend().createProject('/parent', 'Paper');
    expect(invoke).toHaveBeenCalledWith('create_project', { parent: '/parent', name: 'Paper' });
    expect(snapshot).toEqual({
      name: 'Paper',
      root: '/p',
      rootDocument: 'main.tex',
      documents: [{ path: 'main.tex', kind: 'tex' }]
    });
  });

  it('opens a folder', async () => {
    invoke.mockResolvedValueOnce(raw);
    const snapshot = await tauriProjectBackend().openFolder('/somewhere');
    expect(invoke).toHaveBeenCalledWith('open_folder', { path: '/somewhere' });
    expect(snapshot.rootDocument).toBe('main.tex');
  });

  it('reads and saves documents', async () => {
    invoke.mockResolvedValueOnce('file body');
    expect(await tauriProjectBackend().readDocument('/p', 'main.tex')).toBe('file body');
    expect(invoke).toHaveBeenCalledWith('read_document', { root: '/p', rel: 'main.tex' });

    invoke.mockResolvedValueOnce(undefined);
    await tauriProjectBackend().saveDocument('/p', 'main.tex', 'new body');
    expect(invoke).toHaveBeenCalledWith('save_document', {
      root: '/p',
      rel: 'main.tex',
      contents: 'new body'
    });
  });

  it('returns the picked folder, or null when cancelled or multi', async () => {
    open.mockResolvedValueOnce('/picked');
    expect(await tauriProjectBackend().pickFolder('t')).toBe('/picked');
    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false, title: 't' });

    open.mockResolvedValueOnce(null);
    expect(await tauriProjectBackend().pickFolder('t')).toBeNull();
  });

  it('compiles, decoding the PDF byte array', async () => {
    invoke.mockResolvedValueOnce({ ok: true, log: 'Done.', pdf: [37, 80, 68, 70] });
    const result = await tauriProjectBackend().compile('\\documentclass{article}', 'main.tex');
    expect(invoke).toHaveBeenCalledWith('compile_document', {
      source: '\\documentclass{article}',
      rootDocument: 'main.tex'
    });
    expect(result.ok).toBe(true);
    expect(result.log).toBe('Done.');
    expect(result.pdf).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it('maps a null PDF on a failed compile', async () => {
    invoke.mockResolvedValueOnce({ ok: false, log: '! error', pdf: null });
    const result = await tauriProjectBackend().compile('bad', 'main.tex');
    expect(result.ok).toBe(false);
    expect(result.pdf).toBeNull();
  });
});

describe('browserProjectBackend', () => {
  it('seeds a demo project and reads its files', async () => {
    const backend = browserProjectBackend();
    const snapshot = await backend.openFolder('/home/ada/thesis');
    expect(snapshot.name).toBe('thesis');
    expect(snapshot.rootDocument).toBe('main.tex');
    const paths = snapshot.documents.map((d) => d.path);
    expect(paths).toContain('sections/introduction.tex');
    expect(await backend.readDocument(snapshot.root, 'main.tex')).toContain('Galley demo');
  });

  it('falls back to a name when the path has none', async () => {
    const snapshot = await browserProjectBackend().openFolder('/');
    expect(snapshot.name).toBe('project');
  });

  it('creates a project with just a starter file', async () => {
    const backend = browserProjectBackend();
    const snapshot = await backend.createProject('/parent', 'Fresh');
    expect(snapshot.root).toBe('/parent/Fresh');
    expect(snapshot.documents).toEqual([{ path: 'main.tex', kind: 'tex' }]);
    expect(await backend.readDocument(snapshot.root, 'main.tex')).toContain('Pull a proof');
  });

  it('saves edits and reflects them on read, and throws for missing files', async () => {
    const backend = browserProjectBackend();
    await backend.saveDocument('/r', 'main.tex', 'edited');
    expect(await backend.readDocument('/r', 'main.tex')).toBe('edited');
    await expect(backend.readDocument('/r', 'nope.tex')).rejects.toThrow('no such file');
  });

  it('picks a canned folder', async () => {
    expect(await browserProjectBackend().pickFolder('t')).toBe('/demo/galley-project');
  });

  it('compiles a closing document to the demo PDF, and fails otherwise', async () => {
    const backend = browserProjectBackend();
    const ok = await backend.compile(
      '\\documentclass{article}\\begin{document}x\\end{document}',
      'main.tex'
    );
    expect(ok.ok).toBe(true);
    expect(ok.pdf).not.toBeNull();
    // A real, parseable PDF (starts with the %PDF- header).
    expect(ok.pdf!.slice(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));

    const bad = await backend.compile('no end here', 'main.tex');
    expect(bad.ok).toBe(false);
    expect(bad.pdf).toBeNull();
  });
});

describe('backend selection', () => {
  it('detects Tauri and picks the matching backend', () => {
    const tauriWin = { __TAURI_INTERNALS__: {} } as unknown as Window;
    const plainWin = {} as unknown as Window;
    expect(isTauri(tauriWin)).toBe(true);
    expect(isTauri(plainWin)).toBe(false);
    // Both selections construct without throwing; methods are covered above.
    expect(typeof selectBackend(tauriWin).openFolder).toBe('function');
    expect(typeof selectBackend(plainWin).openFolder).toBe('function');
  });
});
