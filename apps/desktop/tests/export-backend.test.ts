import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  browserExportBackend,
  tauriExportBackend,
  selectExportBackend
} from '../src/lib/export-backend';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args)
}));

const BYTES = new Uint8Array([37, 80, 68, 70]); // "%PDF"

// ---------------------------------------------------------------------------
// browserExportBackend
// ---------------------------------------------------------------------------

describe('browserExportBackend', () => {
  const backend = browserExportBackend();

  it('savePdf resolves without error', async () => {
    await expect(backend.savePdf(BYTES, '/tmp/out.pdf')).resolves.toBeUndefined();
  });

  it('saveShareBundle resolves with 0', async () => {
    await expect(backend.saveShareBundle('/proj', BYTES, '/tmp/out.zip')).resolves.toBe(0);
  });

  it('runPandoc resolves without error', async () => {
    await expect(
      backend.runPandoc('/proj', 'main.tex', 'html5', '/tmp/out.html')
    ).resolves.toBeUndefined();
  });

  it('checkPandoc resolves to false', async () => {
    await expect(backend.checkPandoc('/proj', 'main.tex')).resolves.toBe(false);
  });

  it('print is a no-op', () => {
    expect(() => backend.print(BYTES)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// tauriExportBackend
// ---------------------------------------------------------------------------

describe('tauriExportBackend', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  const backend = tauriExportBackend();

  it('savePdf invokes export_pdf_to', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await backend.savePdf(BYTES, '/tmp/out.pdf');
    expect(mockInvoke).toHaveBeenCalledWith('export_pdf_to', {
      pdfBytes: Array.from(BYTES),
      dest: '/tmp/out.pdf'
    });
  });

  it('saveShareBundle invokes export_share_bundle_to and returns bytes written', async () => {
    mockInvoke.mockResolvedValue(42);
    const n = await backend.saveShareBundle('/proj', BYTES, '/tmp/share.zip');
    expect(n).toBe(42);
    expect(mockInvoke).toHaveBeenCalledWith('export_share_bundle_to', {
      root: '/proj',
      pdfBytes: Array.from(BYTES),
      dest: '/tmp/share.zip'
    });
  });

  it('runPandoc invokes export_pandoc', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await backend.runPandoc('/proj', 'main.tex', 'html5', '/tmp/out.html');
    expect(mockInvoke).toHaveBeenCalledWith('export_pandoc', {
      root: '/proj',
      rootDocument: 'main.tex',
      format: 'html5',
      dest: '/tmp/out.html'
    });
  });

  it('checkPandoc returns true when export_pandoc succeeds', async () => {
    mockInvoke.mockResolvedValue(undefined);
    const result = await backend.checkPandoc('/proj', 'main.tex');
    expect(result).toBe(true);
  });

  it('checkPandoc returns false when Pandoc is not installed', async () => {
    mockInvoke.mockRejectedValue(new Error('Pandoc is not installed — install it'));
    const result = await backend.checkPandoc('/proj', 'main.tex');
    expect(result).toBe(false);
  });

  it('checkPandoc returns true when pandoc fails for another reason', async () => {
    mockInvoke.mockRejectedValue(new Error('Pandoc failed: some pandoc error'));
    const result = await backend.checkPandoc('/proj', 'main.tex');
    expect(result).toBe(true);
  });

  describe('print', () => {
    it('creates a blob URL and opens a new window', () => {
      const mockUrl = 'blob:mock-url';
      const createObjectURL = vi.fn(() => mockUrl);
      const revokeObjectURL = vi.fn();
      const mockWin = {
        addEventListener: vi.fn((event: string, cb: () => void) => {
          if (event === 'load') cb();
        }),
        print: vi.fn()
      };
      const open = vi.fn(() => mockWin);

      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
      vi.stubGlobal(
        'Blob',
        class {
          constructor(
            public parts: unknown[],
            public opts: unknown
          ) {}
        }
      );
      vi.stubGlobal('window', { open });

      backend.print(BYTES);

      expect(createObjectURL).toHaveBeenCalled();
      expect(open).toHaveBeenCalledWith(mockUrl, '_blank');
      expect(mockWin.print).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith(mockUrl);

      vi.unstubAllGlobals();
    });

    it('revokes the URL when window.open returns null', () => {
      const mockUrl = 'blob:mock-url-2';
      const createObjectURL = vi.fn(() => mockUrl);
      const revokeObjectURL = vi.fn();
      const open = vi.fn(() => null);

      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
      vi.stubGlobal(
        'Blob',
        class {
          constructor(
            public parts: unknown[],
            public opts: unknown
          ) {}
        }
      );
      vi.stubGlobal('window', { open });

      backend.print(BYTES);

      expect(revokeObjectURL).toHaveBeenCalledWith(mockUrl);

      vi.unstubAllGlobals();
    });
  });
});

// ---------------------------------------------------------------------------
// selectExportBackend
// ---------------------------------------------------------------------------

describe('selectExportBackend', () => {
  it('returns tauriExportBackend when __TAURI_INTERNALS__ is present', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const b = selectExportBackend();
    expect(b).toBeDefined();
    vi.unstubAllGlobals();
  });

  it('returns browserExportBackend when __TAURI_INTERNALS__ is absent', () => {
    vi.stubGlobal('window', {});
    const b = selectExportBackend();
    expect(b).toBeDefined();
    vi.unstubAllGlobals();
  });
});
