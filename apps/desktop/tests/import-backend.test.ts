import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const openDialog = vi.fn();
const saveDialog = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openDialog(...args),
  save: (...args: unknown[]) => saveDialog(...args)
}));

import { tauriImportBackend, browserImportBackend } from '../src/lib/import-backend';

const RAW_ANALYSIS = {
  root_file: 'main.tex',
  engine: 'Tectonic (embedded)',
  bib_tool: 'BibTeX',
  encoding: 'utf8',
  packages: ['amsmath', 'graphicx'],
  fonts: ['cm'],
  warnings: ['XeLaTeX detected'],
  file_count: 5,
  total_bytes: 8192
};

const RAW_PROJECT = {
  name: 'my-thesis',
  root: '/home/user/projects/my-thesis',
  root_document: 'main.tex',
  documents: [
    { path: 'main.tex', kind: 'tex' },
    { path: 'references.bib', kind: 'bib' }
  ]
};

beforeEach(() => {
  invoke.mockReset();
  openDialog.mockReset();
  saveDialog.mockReset();
});

// ── tauriImportBackend ──────────────────────────────────────────────────────

describe('tauriImportBackend.pickFile', () => {
  it('returns path and name when dialog resolves a string', async () => {
    openDialog.mockResolvedValueOnce('/home/user/thesis.zip');
    const result = await tauriImportBackend().pickFile('Select', []);
    expect(result).toEqual({ path: '/home/user/thesis.zip', name: 'thesis.zip' });
  });

  it('returns null when dialog is cancelled', async () => {
    openDialog.mockResolvedValueOnce(null);
    const result = await tauriImportBackend().pickFile('Select', []);
    expect(result).toBeNull();
  });

  it('extracts the basename from a Windows-style path', async () => {
    openDialog.mockResolvedValueOnce('C:\\Users\\user\\thesis.zip');
    const result = await tauriImportBackend().pickFile('Select', []);
    expect(result?.name).toBe('thesis.zip');
  });
});

describe('tauriImportBackend.pickFolder', () => {
  it('returns the path when dialog resolves a string', async () => {
    openDialog.mockResolvedValueOnce('/home/user/latex');
    const path = await tauriImportBackend().pickFolder('Select folder');
    expect(path).toBe('/home/user/latex');
  });

  it('returns null when dialog is cancelled', async () => {
    openDialog.mockResolvedValueOnce(null);
    const path = await tauriImportBackend().pickFolder('Select folder');
    expect(path).toBeNull();
  });
});

describe('tauriImportBackend.pickSavePath', () => {
  it('returns the path when save dialog resolves a string', async () => {
    saveDialog.mockResolvedValueOnce('/home/user/export.zip');
    const path = await tauriImportBackend().pickSavePath('export.zip', []);
    expect(path).toBe('/home/user/export.zip');
  });

  it('returns null when save dialog is cancelled', async () => {
    saveDialog.mockResolvedValueOnce(null);
    const path = await tauriImportBackend().pickSavePath('export.zip', []);
    expect(path).toBeNull();
  });
});

describe('tauriImportBackend.analyzeArchive', () => {
  it('invokes import_analyze_archive and maps snake_case to camelCase', async () => {
    invoke.mockResolvedValueOnce(RAW_ANALYSIS);
    const analysis = await tauriImportBackend().analyzeArchive('/home/user/thesis.zip');
    expect(invoke).toHaveBeenCalledWith('import_analyze_archive', {
      path: '/home/user/thesis.zip'
    });
    expect(analysis.rootFile).toBe('main.tex');
    expect(analysis.engine).toBe('Tectonic (embedded)');
    expect(analysis.bibTool).toBe('BibTeX');
    expect(analysis.encoding).toBe('utf8');
    expect(analysis.packages).toEqual(['amsmath', 'graphicx']);
    expect(analysis.fonts).toEqual(['cm']);
    expect(analysis.warnings).toEqual(['XeLaTeX detected']);
    expect(analysis.fileCount).toBe(5);
    expect(analysis.totalBytes).toBe(8192);
  });
});

describe('tauriImportBackend.analyzeFolder', () => {
  it('invokes import_analyze_folder and maps the result', async () => {
    invoke.mockResolvedValueOnce(RAW_ANALYSIS);
    const analysis = await tauriImportBackend().analyzeFolder('/home/user/latex-project');
    expect(invoke).toHaveBeenCalledWith('import_analyze_folder', {
      path: '/home/user/latex-project'
    });
    expect(analysis.rootFile).toBe('main.tex');
    expect(analysis.fileCount).toBe(5);
  });
});

describe('tauriImportBackend.importFromArchive', () => {
  it('invokes import_from_archive with correct args and maps the project', async () => {
    invoke.mockResolvedValueOnce(RAW_PROJECT);
    const project = await tauriImportBackend().importFromArchive(
      '/home/user/thesis.zip',
      '/home/user/projects',
      'my-thesis'
    );
    expect(invoke).toHaveBeenCalledWith('import_from_archive', {
      path: '/home/user/thesis.zip',
      parent: '/home/user/projects',
      name: 'my-thesis'
    });
    expect(project.name).toBe('my-thesis');
    expect(project.root).toBe('/home/user/projects/my-thesis');
    expect(project.rootDocument).toBe('main.tex');
    expect(project.documents).toHaveLength(2);
    expect(project.documents[0].kind).toBe('tex');
    expect(project.documents[1].kind).toBe('bib');
  });
});

describe('tauriImportBackend.importFromFolder', () => {
  it('invokes import_from_folder with correct args and maps the project', async () => {
    invoke.mockResolvedValueOnce(RAW_PROJECT);
    const project = await tauriImportBackend().importFromFolder(
      '/home/user/projects',
      'my-thesis',
      '/home/user/old-project'
    );
    expect(invoke).toHaveBeenCalledWith('import_from_folder', {
      parent: '/home/user/projects',
      name: 'my-thesis',
      src: '/home/user/old-project'
    });
    expect(project.name).toBe('my-thesis');
    expect(project.rootDocument).toBe('main.tex');
  });
});

describe('tauriImportBackend.exportBundleTo', () => {
  it('invokes export_bundle_to and returns the byte count', async () => {
    invoke.mockResolvedValueOnce(12345);
    const n = await tauriImportBackend().exportBundleTo(
      '/home/user/projects/my-thesis',
      '/home/user/downloads/my-thesis.zip'
    );
    expect(invoke).toHaveBeenCalledWith('export_bundle_to', {
      root: '/home/user/projects/my-thesis',
      dest: '/home/user/downloads/my-thesis.zip'
    });
    expect(n).toBe(12345);
  });
});

// ── browserImportBackend ────────────────────────────────────────────────────

describe('browserImportBackend', () => {
  const backend = browserImportBackend();

  it('pickFile returns a demo path', async () => {
    const result = await backend.pickFile('Select', []);
    expect(result).not.toBeNull();
    expect(result!.name).toMatch(/\.zip$/);
  });

  it('pickFolder returns a demo path', async () => {
    const path = await backend.pickFolder('Select folder');
    expect(typeof path).toBe('string');
    expect(path!.length).toBeGreaterThan(0);
  });

  it('pickSavePath returns a demo path', async () => {
    const path = await backend.pickSavePath('export.zip', []);
    expect(typeof path).toBe('string');
    expect(path).toContain('export.zip');
  });

  it('analyzeArchive returns demo analysis', async () => {
    const a = await backend.analyzeArchive('/demo/thesis.zip');
    expect(a.rootFile).toBe('main.tex');
    expect(a.packages.length).toBeGreaterThan(0);
    expect(a.fileCount).toBeGreaterThan(0);
  });

  it('analyzeFolder returns demo analysis', async () => {
    const a = await backend.analyzeFolder('/demo/project');
    expect(a.engine).toContain('Tectonic');
  });

  it('importFromArchive returns a demo project snapshot', async () => {
    const p = await backend.importFromArchive('/demo/t.zip', '/home', 'thesis');
    expect(p.name).toBe('thesis');
    expect(p.rootDocument).toBe('main.tex');
    expect(p.documents.length).toBeGreaterThan(0);
  });

  it('importFromFolder returns a demo project snapshot', async () => {
    const p = await backend.importFromFolder('/home', 'thesis', '/old');
    expect(p.name).toBe('thesis');
  });

  it('exportBundleTo returns 0', async () => {
    const n = await backend.exportBundleTo('/root', '/dest.zip');
    expect(n).toBe(0);
  });
});

// ── selectImportBackend ─────────────────────────────────────────────────────

import { selectImportBackend } from '../src/lib/import-backend';

describe('selectImportBackend', () => {
  it('returns browserImportBackend in non-Tauri environment', () => {
    // window has no __TAURI_INTERNALS__ in jsdom.
    const backend = selectImportBackend();
    // Browser backend's pickFolder resolves to a demo path without any IPC.
    return expect(backend.pickFolder('test')).resolves.toContain('/demo/');
  });

  it('returns tauriImportBackend when __TAURI_INTERNALS__ is present', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    const backend = selectImportBackend();
    // The Tauri backend wraps invoke — it is the tauri backend if it calls invoke.
    invoke.mockResolvedValueOnce({
      root_file: 'main.tex',
      engine: 'Tectonic (embedded)',
      bib_tool: 'None',
      encoding: '',
      packages: [],
      fonts: [],
      warnings: [],
      file_count: 1,
      total_bytes: 0
    });
    const p = backend.analyzeArchive('/some/path.zip');
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
    return expect(p).resolves.toHaveProperty('rootFile', 'main.tex');
  });
});
