import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import {
  tauriLanguageBackend,
  browserLanguageBackend,
  selectLanguageBackend,
  filePathFromUri,
  relativeToRoot,
  resolveDefinition,
  flattenSymbols,
  type DocumentSymbol
} from '../src/lib/language-backend';
import type { ProjectSnapshot } from '../src/lib/project-backend';

const PROJECT: ProjectSnapshot = {
  name: 'demo',
  root: '/home/u/proj',
  rootDocument: 'main.tex',
  documents: []
};

function fakeWindow(tauri: boolean): Window {
  return (tauri ? { __TAURI_INTERNALS__: {} } : {}) as unknown as Window;
}

beforeEach(() => {
  invoke.mockReset();
});

describe('tauriLanguageBackend', () => {
  it('maps completion items, renaming insert_text', async () => {
    invoke.mockResolvedValueOnce([
      {
        label: 'frac',
        kind: 'command',
        detail: 'math',
        insert_text: 'frac{}{}',
        documentation: 'A fraction'
      }
    ]);
    const items = await tauriLanguageBackend().completion('/r', 'm.tex', 'src', 2, 3);
    expect(invoke).toHaveBeenCalledWith('lsp_completion', {
      root: '/r',
      rel: 'm.tex',
      source: 'src',
      line: 2,
      character: 3
    });
    expect(items).toEqual([
      {
        label: 'frac',
        kind: 'command',
        detail: 'math',
        insertText: 'frac{}{}',
        documentation: 'A fraction'
      }
    ]);
  });

  it('forwards hover, definition, and diagnostics verbatim', async () => {
    invoke.mockResolvedValueOnce('help text');
    expect(await tauriLanguageBackend().hover('/r', 'm.tex', 's', 0, 0)).toBe('help text');
    expect(invoke).toHaveBeenLastCalledWith('lsp_hover', {
      root: '/r',
      rel: 'm.tex',
      source: 's',
      line: 0,
      character: 0
    });

    const loc = { file: 'file:///r/x.tex', line: 4, character: 1 };
    invoke.mockResolvedValueOnce(loc);
    expect(await tauriLanguageBackend().definition('/r', 'm.tex', 's', 1, 2)).toEqual(loc);

    invoke.mockResolvedValueOnce([]);
    expect(await tauriLanguageBackend().diagnostics('/r', 'm.tex', 's')).toEqual([]);
    expect(invoke).toHaveBeenLastCalledWith('lsp_diagnostics', {
      root: '/r',
      rel: 'm.tex',
      source: 's'
    });
  });

  it('maps nested document symbols', async () => {
    invoke.mockResolvedValueOnce([
      {
        name: 'Intro',
        detail: 'sec:intro',
        kind: 'section',
        line: 3,
        children: [{ name: 'Fig', detail: null, kind: 'environment', line: 7, children: [] }]
      }
    ]);
    const symbols = await tauriLanguageBackend().symbols('/r', 'm.tex', 's');
    expect(symbols[0].name).toBe('Intro');
    expect(symbols[0].children[0]).toEqual({
      name: 'Fig',
      detail: null,
      kind: 'environment',
      line: 7,
      children: []
    });
  });
});

describe('browserLanguageBackend', () => {
  it('serves deterministic, usable language results without a server', async () => {
    const backend = browserLanguageBackend();
    const items = await backend.completion('/r', 'm.tex', 's', 0, 0);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.kind === 'command')).toBe(true);
    // A snippet item carries an explicit insertion.
    expect(items.some((item) => item.insertText !== null)).toBe(true);

    expect(await backend.hover('/r', 'm.tex', 's', 0, 0)).toBe('A LaTeX command.');
    expect(await backend.definition('/r', 'm.tex', 's', 0, 0)).toEqual({
      file: 'main.tex',
      line: 0,
      character: 0
    });
    const symbols = await backend.symbols('/r', 'm.tex', 's');
    expect(symbols[0].kind).toBe('section');
    expect(await backend.diagnostics('/r', 'm.tex', 's')).toEqual([]);
  });
});

describe('selectLanguageBackend', () => {
  it('picks the tauri backend inside a Tauri window and the browser one otherwise', async () => {
    // The browser backend is deterministic; the tauri one calls invoke.
    invoke.mockResolvedValue('hovered');
    const inTauri = selectLanguageBackend(fakeWindow(true));
    expect(await inTauri.hover('/r', 'm.tex', 's', 0, 0)).toBe('hovered');

    const inBrowser = selectLanguageBackend(fakeWindow(false));
    expect(await inBrowser.hover('/r', 'm.tex', 's', 0, 0)).toBe('A LaTeX command.');
  });
});

describe('filePathFromUri', () => {
  it('strips a file URI and decodes it, passing plain paths through', () => {
    expect(filePathFromUri('file:///home/u/a%20b.tex')).toBe('/home/u/a b.tex');
    expect(filePathFromUri('main.tex')).toBe('main.tex');
  });
});

describe('relativeToRoot', () => {
  it('relativises paths under the root and returns others unchanged', () => {
    expect(relativeToRoot('/home/u/proj', '/home/u/proj/sections/extra.tex')).toBe(
      'sections/extra.tex'
    );
    // A trailing slash on the root is handled.
    expect(relativeToRoot('/home/u/proj/', '/home/u/proj/main.tex')).toBe('main.tex');
    // A path outside the root is returned verbatim.
    expect(relativeToRoot('/home/u/proj', 'main.tex')).toBe('main.tex');
  });
});

describe('resolveDefinition', () => {
  it('resolves a file URI to a project-relative target', () => {
    const target = resolveDefinition(
      { file: 'file:///home/u/proj/sections/extra.tex', line: 5, character: 0 },
      PROJECT
    );
    expect(target).toEqual({ rel: 'sections/extra.tex', line: 5 });
  });

  it('returns null when no project is open', () => {
    expect(resolveDefinition({ file: 'main.tex', line: 0, character: 0 }, null)).toBeNull();
  });
});

describe('flattenSymbols', () => {
  it('flattens a tree into indented rows in document order', () => {
    const tree: DocumentSymbol[] = [
      {
        name: 'A',
        detail: null,
        kind: 'section',
        line: 0,
        children: [{ name: 'B', detail: null, kind: 'environment', line: 1, children: [] }]
      },
      { name: 'C', detail: null, kind: 'section', line: 2, children: [] }
    ];
    expect(flattenSymbols(tree)).toEqual([
      { symbol: tree[0], depth: 0 },
      { symbol: tree[0].children[0], depth: 1 },
      { symbol: tree[1], depth: 0 }
    ]);
    expect(flattenSymbols([])).toEqual([]);
  });
});
