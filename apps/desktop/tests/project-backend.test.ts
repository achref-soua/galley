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
