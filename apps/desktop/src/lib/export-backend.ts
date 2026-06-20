/**
 * Export seam between the ExportPanel UI and the Tauri command layer.
 *
 * {@link ExportBackend} is the interface every caller uses. The packaged app
 * binds {@link tauriExportBackend}; tests and the browser fallback use
 * {@link browserExportBackend}.
 *
 * File-picking reuses {@link ImportBackend.pickSavePath} from import-backend so
 * there is one canonical dialog entry point.
 */

import { invoke } from '@tauri-apps/api/core';

/** Pandoc target format strings. */
export type PandocFormat = 'html5' | 'docx' | 'markdown';

/** Operations for exporting a compiled Galley project. */
export interface ExportBackend {
  /**
   * Write `pdfBytes` to `dest` (an absolute filesystem path).
   */
  savePdf(pdfBytes: Uint8Array, dest: string): Promise<void>;

  /**
   * Write a share bundle (clean source + PDF) to `dest`.
   * Returns the number of bytes written.
   */
  saveShareBundle(root: string, pdfBytes: Uint8Array, dest: string): Promise<number>;

  /**
   * Invoke Pandoc to convert the project's root `.tex` file to `format` and
   * write the result to `dest`. Rejects when Pandoc is not installed or fails.
   */
  runPandoc(root: string, rootDocument: string, format: PandocFormat, dest: string): Promise<void>;

  /**
   * Ask the OS whether `pandoc` is in `PATH`.
   * Returns `true` when it is available, `false` otherwise.
   */
  checkPandoc(root: string, rootDocument: string): Promise<boolean>;

  /**
   * Open the browser / WebView print dialog for the given PDF bytes.
   * Creates a temporary object URL, opens a new window, and triggers print.
   */
  print(pdfBytes: Uint8Array): void;
}

// ---------------------------------------------------------------------------
// Tauri adapter
// ---------------------------------------------------------------------------

/** The backend backed by the Tauri command layer (used in the packaged app). */
export function tauriExportBackend(): ExportBackend {
  return {
    async savePdf(pdfBytes, dest) {
      await invoke<void>('export_pdf_to', { pdfBytes: Array.from(pdfBytes), dest });
    },

    async saveShareBundle(root, pdfBytes, dest) {
      return invoke<number>('export_share_bundle_to', {
        root,
        pdfBytes: Array.from(pdfBytes),
        dest
      });
    },

    async runPandoc(root, rootDocument, format, dest) {
      await invoke<void>('export_pandoc', { root, rootDocument, format, dest });
    },

    async checkPandoc(root, rootDocument) {
      try {
        await invoke<void>('export_pandoc', {
          root,
          rootDocument,
          format: 'markdown',
          dest: '/dev/null'
        });
        return true;
      } catch (err) {
        return !String(err).includes('not installed');
      }
    },

    print(pdfBytes) {
      const blob = new Blob([Uint8Array.from(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) {
        win.addEventListener('load', () => {
          win.print();
          URL.revokeObjectURL(url);
        });
      } else {
        URL.revokeObjectURL(url);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Browser / test stub
// ---------------------------------------------------------------------------

/** A no-op browser backend for tests and dev mode (never touches disk). */
export function browserExportBackend(): ExportBackend {
  return {
    async savePdf() {
      // no-op in browser
    },

    async saveShareBundle() {
      return 0;
    },

    async runPandoc() {
      // no-op in browser
    },

    async checkPandoc() {
      return false;
    },

    print() {
      // no-op in browser; real implementation opens a blob URL
    }
  };
}

// ---------------------------------------------------------------------------
// Runtime selector
// ---------------------------------------------------------------------------

/** Whether the app is running inside a Tauri window. */
function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

/** Pick the right export backend for the current runtime. */
export function selectExportBackend(): ExportBackend {
  return isTauri() ? tauriExportBackend() : browserExportBackend();
}
