import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ExportPanel from '../src/lib/ExportPanel.svelte';
import type { ImportBackend } from '../src/lib/import-backend';
import type { ExportBackend } from '../src/lib/export-backend';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const PDF = new Uint8Array([37, 80, 68, 70]); // "%PDF"

function makeImport(overrides: Partial<ImportBackend> = {}): ImportBackend {
  return {
    pickFile: vi.fn(async () => null),
    pickFolder: vi.fn(async () => null),
    pickSavePath: vi.fn(async (name: string) => `/tmp/${name}`),
    analyzeArchive: vi.fn(async () => ({
      rootFile: 'main.tex',
      engine: 'Tectonic',
      bibTool: 'BibTeX',
      encoding: 'utf8',
      packages: [],
      fonts: [],
      warnings: [],
      fileCount: 1,
      totalBytes: 100
    })),
    analyzeFolder: vi.fn(async () => ({
      rootFile: 'main.tex',
      engine: 'Tectonic',
      bibTool: 'BibTeX',
      encoding: 'utf8',
      packages: [],
      fonts: [],
      warnings: [],
      fileCount: 1,
      totalBytes: 100
    })),
    importFromArchive: vi.fn(async () => ({
      name: 'p',
      root: '/p',
      rootDocument: 'main.tex',
      documents: []
    })),
    importFromFolder: vi.fn(async () => ({
      name: 'p',
      root: '/p',
      rootDocument: 'main.tex',
      documents: []
    })),
    exportBundleTo: vi.fn(async () => 1024),
    ...overrides
  };
}

function makeExport(overrides: Partial<ExportBackend> = {}): ExportBackend {
  return {
    savePdf: vi.fn(async () => {}),
    saveShareBundle: vi.fn(async () => 512),
    runPandoc: vi.fn(async () => {}),
    checkPandoc: vi.fn(async () => false),
    print: vi.fn(),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PanelProps {
  open?: boolean;
  pdfBytes?: Uint8Array | null;
  importBackend?: ImportBackend;
  exportBackend?: ExportBackend;
  onclose?: () => void;
}

function renderPanel(props: PanelProps = {}) {
  const importBackend = props.importBackend ?? makeImport();
  const exportBackend = props.exportBackend ?? makeExport();
  const onclose = props.onclose ?? vi.fn();
  return {
    ...render(ExportPanel, {
      open: props.open ?? true,
      projectRoot: '/proj',
      projectName: 'MyPaper',
      rootDocument: 'main.tex',
      pdfBytes: props.pdfBytes !== undefined ? props.pdfBytes : PDF,
      importBackend,
      exportBackend,
      onclose
    }),
    importBackend,
    exportBackend,
    onclose
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ExportPanel — rendering', () => {
  it('renders the panel when open is true', () => {
    renderPanel();
    expect(screen.getByRole('dialog', { name: 'Export' })).toBeTruthy();
  });

  it('does not render when open is false', () => {
    renderPanel({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows all seven export option buttons', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export source bundle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export share bundle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print document' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export HTML' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export Word document' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export Markdown' })).toBeTruthy();
  });

  it('shows close button', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Close export panel' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Disabled state when no PDF
// ---------------------------------------------------------------------------

describe('ExportPanel — disabled state without PDF', () => {
  it('PDF, share bundle, and print buttons are disabled when pdfBytes is null', () => {
    renderPanel({ pdfBytes: null });
    expect(screen.getByRole('button', { name: 'Export PDF' }).hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Export share bundle' }).hasAttribute('disabled')
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Print document' }).hasAttribute('disabled')).toBe(
      true
    );
  });

  it('source bundle and Pandoc buttons are enabled when pdfBytes is null', () => {
    renderPanel({ pdfBytes: null });
    expect(
      screen.getByRole('button', { name: 'Export source bundle' }).hasAttribute('disabled')
    ).toBe(false);
    expect(screen.getByRole('button', { name: 'Export HTML' }).hasAttribute('disabled')).toBe(
      false
    );
    expect(
      screen.getByRole('button', { name: 'Export Word document' }).hasAttribute('disabled')
    ).toBe(false);
    expect(screen.getByRole('button', { name: 'Export Markdown' }).hasAttribute('disabled')).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

describe('ExportPanel — close', () => {
  it('calls onclose when the close button is clicked', async () => {
    const { onclose } = renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Close export panel' }));
    await tick();
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('calls onclose on Escape key', async () => {
    const { onclose } = renderPanel();
    const dialog = screen.getByRole('dialog');
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await tick();
    expect(onclose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Export PDF
// ---------------------------------------------------------------------------

describe('ExportPanel — export PDF', () => {
  it('calls savePdf with the PDF bytes and picked path', async () => {
    const { exportBackend } = renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await tick();
    await tick();
    expect(exportBackend.savePdf).toHaveBeenCalledWith(PDF, '/tmp/MyPaper.pdf');
  });

  it('shows "complete" status after success', async () => {
    renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await tick();
    await tick();
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('complete');
  });

  it('shows error status when savePdf rejects', async () => {
    renderPanel({
      exportBackend: makeExport({
        savePdf: vi.fn(async () => {
          throw new Error('disk full');
        })
      })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await tick();
    await tick();
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('disk full');
  });

  it('does nothing when pickSavePath returns null', async () => {
    const { exportBackend } = renderPanel({
      importBackend: makeImport({ pickSavePath: vi.fn(async () => null) })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await tick();
    await tick();
    expect(exportBackend.savePdf).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Source bundle
// ---------------------------------------------------------------------------

describe('ExportPanel — source bundle', () => {
  it('calls exportBundleTo with the project root and picked path', async () => {
    const { importBackend } = renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Export source bundle' }));
    await tick();
    await tick();
    expect(importBackend.exportBundleTo).toHaveBeenCalledWith('/proj', '/tmp/MyPaper.zip');
  });

  it('does nothing when pickSavePath returns null', async () => {
    const { importBackend } = renderPanel({
      importBackend: makeImport({ pickSavePath: vi.fn(async () => null) })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Export source bundle' }));
    await tick();
    await tick();
    expect(importBackend.exportBundleTo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Share bundle
// ---------------------------------------------------------------------------

describe('ExportPanel — share bundle', () => {
  it('calls saveShareBundle with root, bytes, and path', async () => {
    const { exportBackend } = renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Export share bundle' }));
    await tick();
    await tick();
    expect(exportBackend.saveShareBundle).toHaveBeenCalledWith(
      '/proj',
      PDF,
      '/tmp/MyPaper-share.zip'
    );
  });

  it('does nothing when pickSavePath returns null', async () => {
    const { exportBackend } = renderPanel({
      importBackend: makeImport({ pickSavePath: vi.fn(async () => null) })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Export share bundle' }));
    await tick();
    await tick();
    expect(exportBackend.saveShareBundle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

describe('ExportPanel — print', () => {
  it('calls exportBackend.print with the PDF bytes', async () => {
    const { exportBackend } = renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Print document' }));
    await tick();
    expect(exportBackend.print).toHaveBeenCalledWith(PDF);
  });
});

// ---------------------------------------------------------------------------
// Pandoc exports
// ---------------------------------------------------------------------------

describe('ExportPanel — Pandoc exports', () => {
  it('calls runPandoc with html5 format', async () => {
    const { exportBackend } = renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Export HTML' }));
    await tick();
    await tick();
    expect(exportBackend.runPandoc).toHaveBeenCalledWith(
      '/proj',
      'main.tex',
      'html5',
      '/tmp/MyPaper.html'
    );
  });

  it('calls runPandoc with docx format', async () => {
    const { exportBackend } = renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Export Word document' }));
    await tick();
    await tick();
    expect(exportBackend.runPandoc).toHaveBeenCalledWith(
      '/proj',
      'main.tex',
      'docx',
      '/tmp/MyPaper.docx'
    );
  });

  it('calls runPandoc with markdown format', async () => {
    const { exportBackend } = renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Export Markdown' }));
    await tick();
    await tick();
    expect(exportBackend.runPandoc).toHaveBeenCalledWith(
      '/proj',
      'main.tex',
      'markdown',
      '/tmp/MyPaper.md'
    );
  });

  it('shows error status when Pandoc is not installed', async () => {
    renderPanel({
      exportBackend: makeExport({
        runPandoc: vi.fn(async () => {
          throw new Error(
            'Pandoc is not installed — install it to enable HTML, Word, and Markdown export.'
          );
        })
      })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Export HTML' }));
    await tick();
    await tick();
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('not installed');
  });

  it('does nothing when pickSavePath returns null for HTML', async () => {
    const { exportBackend } = renderPanel({
      importBackend: makeImport({ pickSavePath: vi.fn(async () => null) })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Export HTML' }));
    await tick();
    await tick();
    expect(exportBackend.runPandoc).not.toHaveBeenCalled();
  });

  it('does nothing when pickSavePath returns null for Word', async () => {
    const { exportBackend } = renderPanel({
      importBackend: makeImport({ pickSavePath: vi.fn(async () => null) })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Export Word document' }));
    await tick();
    await tick();
    expect(exportBackend.runPandoc).not.toHaveBeenCalled();
  });

  it('does nothing when pickSavePath returns null for Markdown', async () => {
    const { exportBackend } = renderPanel({
      importBackend: makeImport({ pickSavePath: vi.fn(async () => null) })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Export Markdown' }));
    await tick();
    await tick();
    expect(exportBackend.runPandoc).not.toHaveBeenCalled();
  });
});
