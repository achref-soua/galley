import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import {
  browserAgentToolBackend,
  tauriAgentToolBackend,
  selectAgentToolBackend,
  dispatchTool,
  type AgentToolBackend
} from '../src/lib/agent-backend';

beforeEach(() => {
  invoke.mockReset();
});

// ── tauriAgentToolBackend ─────────────────────────────────────────────────────

describe('tauriAgentToolBackend — success paths', () => {
  const root = '/projects/p';

  it('readFile calls read_document and returns ok', async () => {
    invoke.mockResolvedValueOnce('file content');
    const r = await tauriAgentToolBackend(root).readFile('main.tex');
    expect(invoke).toHaveBeenCalledWith('read_document', { projectRoot: root, path: 'main.tex' });
    expect(r).toEqual({ ok: true, output: 'file content' });
  });

  it('searchProject calls search_project and joins results', async () => {
    invoke.mockResolvedValueOnce(['main.tex:1', 'intro.tex:5']);
    const r = await tauriAgentToolBackend(root).searchProject('section');
    expect(invoke).toHaveBeenCalledWith('search_project', { projectRoot: root, query: 'section' });
    expect(r).toEqual({ ok: true, output: 'main.tex:1\nintro.tex:5' });
  });

  it('compile calls compile_document and returns ok', async () => {
    invoke.mockResolvedValueOnce('Compilation log');
    const r = await tauriAgentToolBackend(root).compile();
    expect(invoke).toHaveBeenCalledWith('compile_document', { projectRoot: root });
    expect(r).toEqual({ ok: true, output: 'Compilation log' });
  });

  it('readDiagnostics calls read_diagnostics and returns ok', async () => {
    invoke.mockResolvedValueOnce('! Undefined');
    const r = await tauriAgentToolBackend(root).readDiagnostics();
    expect(invoke).toHaveBeenCalledWith('read_diagnostics', { projectRoot: root });
    expect(r).toEqual({ ok: true, output: '! Undefined' });
  });

  it('lookupReference calls lookup_reference and returns ok', async () => {
    invoke.mockResolvedValueOnce('Author 2024');
    const r = await tauriAgentToolBackend(root).lookupReference('deep learning');
    expect(invoke).toHaveBeenCalledWith('lookup_reference', {
      projectRoot: root,
      query: 'deep learning'
    });
    expect(r).toEqual({ ok: true, output: 'Author 2024' });
  });

  it('applyPatch returns the patch directly without invoking Tauri', async () => {
    const r = await tauriAgentToolBackend(root).applyPatch('\\textbf{fixed}');
    expect(invoke).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, output: '\\textbf{fixed}' });
  });

  it('listAssets calls list_assets and joins results', async () => {
    invoke.mockResolvedValueOnce(['fig1.pdf', 'fig2.png']);
    const r = await tauriAgentToolBackend(root).listAssets();
    expect(invoke).toHaveBeenCalledWith('list_assets', { projectRoot: root });
    expect(r).toEqual({ ok: true, output: 'fig1.pdf\nfig2.png' });
  });
});

describe('tauriAgentToolBackend — error paths', () => {
  const root = '/projects/p';

  it('readFile returns ok: false on invoke failure', async () => {
    invoke.mockRejectedValueOnce(new Error('not found'));
    const r = await tauriAgentToolBackend(root).readFile('missing.tex');
    expect(r.ok).toBe(false);
    expect(r.output).toContain('not found');
  });

  it('searchProject returns ok: false on invoke failure', async () => {
    invoke.mockRejectedValueOnce(new Error('search failed'));
    const r = await tauriAgentToolBackend(root).searchProject('x');
    expect(r.ok).toBe(false);
  });

  it('compile returns ok: false on invoke failure', async () => {
    invoke.mockRejectedValueOnce(new Error('compile error'));
    const r = await tauriAgentToolBackend(root).compile();
    expect(r.ok).toBe(false);
  });

  it('readDiagnostics returns ok: false on invoke failure', async () => {
    invoke.mockRejectedValueOnce(new Error('diag error'));
    const r = await tauriAgentToolBackend(root).readDiagnostics();
    expect(r.ok).toBe(false);
  });

  it('lookupReference returns ok: false on invoke failure', async () => {
    invoke.mockRejectedValueOnce(new Error('lookup failed'));
    const r = await tauriAgentToolBackend(root).lookupReference('x');
    expect(r.ok).toBe(false);
  });

  it('listAssets returns ok: false on invoke failure', async () => {
    invoke.mockRejectedValueOnce(new Error('assets error'));
    const r = await tauriAgentToolBackend(root).listAssets();
    expect(r.ok).toBe(false);
  });
});

// ── browserAgentToolBackend ───────────────────────────────────────────────────

describe('browserAgentToolBackend', () => {
  it('readFile returns ok with stub output', async () => {
    const r = await browserAgentToolBackend().readFile('main.tex');
    expect(r.ok).toBe(true);
    expect(r.output.length).toBeGreaterThan(0);
  });

  it('searchProject returns ok with stub output mentioning the query', async () => {
    const r = await browserAgentToolBackend().searchProject('intro');
    expect(r.ok).toBe(true);
    expect(r.output).toContain('intro');
  });

  it('compile returns ok', async () => {
    const r = await browserAgentToolBackend().compile();
    expect(r.ok).toBe(true);
  });

  it('readDiagnostics returns ok', async () => {
    const r = await browserAgentToolBackend().readDiagnostics();
    expect(r.ok).toBe(true);
  });

  it('lookupReference returns ok with stub output mentioning the query', async () => {
    const r = await browserAgentToolBackend().lookupReference('deep learning');
    expect(r.ok).toBe(true);
    expect(r.output).toContain('deep learning');
  });

  it('applyPatch returns the patch text', async () => {
    const r = await browserAgentToolBackend().applyPatch('\\section{New}');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('\\section{New}');
  });

  it('listAssets returns ok', async () => {
    const r = await browserAgentToolBackend().listAssets();
    expect(r.ok).toBe(true);
  });
});

// ── dispatchTool ──────────────────────────────────────────────────────────────

describe('dispatchTool', () => {
  function makeBackend(result: { ok: boolean; output: string }): AgentToolBackend {
    return {
      readFile: vi.fn().mockResolvedValue(result),
      searchProject: vi.fn().mockResolvedValue(result),
      compile: vi.fn().mockResolvedValue(result),
      readDiagnostics: vi.fn().mockResolvedValue(result),
      lookupReference: vi.fn().mockResolvedValue(result),
      applyPatch: vi.fn().mockResolvedValue(result),
      listAssets: vi.fn().mockResolvedValue(result)
    };
  }

  const ok = { ok: true, output: 'ok' };

  it('routes read_file to backend.readFile', async () => {
    const b = makeBackend(ok);
    await dispatchTool(b, 'read_file', 'main.tex');
    expect(b.readFile).toHaveBeenCalledWith('main.tex');
  });

  it('routes search_project to backend.searchProject', async () => {
    const b = makeBackend(ok);
    await dispatchTool(b, 'search_project', 'query');
    expect(b.searchProject).toHaveBeenCalledWith('query');
  });

  it('routes compile to backend.compile', async () => {
    const b = makeBackend(ok);
    await dispatchTool(b, 'compile', '');
    expect(b.compile).toHaveBeenCalled();
  });

  it('routes read_diagnostics to backend.readDiagnostics', async () => {
    const b = makeBackend(ok);
    await dispatchTool(b, 'read_diagnostics', '');
    expect(b.readDiagnostics).toHaveBeenCalled();
  });

  it('routes lookup_reference to backend.lookupReference', async () => {
    const b = makeBackend(ok);
    await dispatchTool(b, 'lookup_reference', 'deep learning');
    expect(b.lookupReference).toHaveBeenCalledWith('deep learning');
  });

  it('routes apply_patch to backend.applyPatch', async () => {
    const b = makeBackend(ok);
    await dispatchTool(b, 'apply_patch', '\\section{New}');
    expect(b.applyPatch).toHaveBeenCalledWith('\\section{New}');
  });

  it('routes list_assets to backend.listAssets', async () => {
    const b = makeBackend(ok);
    await dispatchTool(b, 'list_assets', '');
    expect(b.listAssets).toHaveBeenCalled();
  });

  it('returns ok: false for an unrecognised tool name', async () => {
    const b = makeBackend(ok);
    const r = await dispatchTool(b, 'teleport', 'mars');
    expect(r.ok).toBe(false);
    expect(r.output).toContain('teleport');
  });
});

// ── selectAgentToolBackend ────────────────────────────────────────────────────

describe('selectAgentToolBackend', () => {
  it('returns a browserAgentToolBackend when __TAURI_INTERNALS__ is absent', () => {
    const b = selectAgentToolBackend('/p', {} as Window);
    expect(typeof b.readFile).toBe('function');
    expect(typeof b.compile).toBe('function');
  });

  it('returns a tauriAgentToolBackend when __TAURI_INTERNALS__ is present', () => {
    const win = { __TAURI_INTERNALS__: {} } as unknown as Window;
    const b = selectAgentToolBackend('/p', win);
    expect(typeof b.readFile).toBe('function');
    expect(typeof b.compile).toBe('function');
  });
});
