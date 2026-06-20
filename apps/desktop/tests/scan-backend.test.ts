import { describe, it, expect, vi, beforeEach } from 'vitest';
import { browserScanBackend, tauriScanBackend, selectScanBackend } from '../src/lib/scan-backend';

const mockInvoke = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args)
}));

// ── browserScanBackend ──────────────────────────────────────────────────────

describe('browserScanBackend', () => {
  const backend = browserScanBackend();

  it('returns an empty report for any source', async () => {
    const report = await backend.scanSource(String.raw`\write18{rm -rf /}`);
    expect(report.shell_escape).toEqual([]);
    expect(report.traversal_inputs).toEqual([]);
  });
});

// ── tauriScanBackend ────────────────────────────────────────────────────────

describe('tauriScanBackend', () => {
  beforeEach(() => mockInvoke.mockReset());

  const backend = tauriScanBackend();

  it('invokes scan_document_source and forwards the report', async () => {
    const expected = { shell_escape: ['0:\\write18'], traversal_inputs: [] };
    mockInvoke.mockResolvedValueOnce(expected);
    const report = await backend.scanSource(String.raw`\write18{ls}`);
    expect(mockInvoke).toHaveBeenCalledWith('scan_document_source', {
      source: String.raw`\write18{ls}`
    });
    expect(report).toEqual(expected);
  });

  it('returns traversal_inputs when the source has suspicious paths', async () => {
    const expected = {
      shell_escape: [],
      traversal_inputs: ['../../etc/passwd']
    };
    mockInvoke.mockResolvedValueOnce(expected);
    const report = await backend.scanSource(String.raw`\input{../../etc/passwd}`);
    expect(report.traversal_inputs).toEqual(['../../etc/passwd']);
  });
});

// ── selectScanBackend ───────────────────────────────────────────────────────

describe('selectScanBackend', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('returns the browser backend when Tauri internals are absent', async () => {
    const win = {} as unknown as Window & typeof globalThis;
    const backend = selectScanBackend(win);
    // Browser stub always returns empty report.
    const report = await backend.scanSource(String.raw`\write18{x}`);
    expect(report.shell_escape).toEqual([]);
  });

  it('returns the tauri backend when Tauri internals are present', async () => {
    const win = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis;
    const backend = selectScanBackend(win);
    const expected = { shell_escape: ['0:\\write18'], traversal_inputs: [] };
    mockInvoke.mockResolvedValueOnce(expected);
    const report = await backend.scanSource(String.raw`\write18{x}`);
    expect(mockInvoke).toHaveBeenCalledWith('scan_document_source', {
      source: String.raw`\write18{x}`
    });
    expect(report).toEqual(expected);
  });
});
