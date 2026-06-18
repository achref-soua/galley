/**
 * The seam between the preview pane and the SyncTeX command layer.
 *
 * Forward search (cursor → PDF) and inverse search (PDF click → source) both
 * go through a {@link SyncTexBackend}. In the packaged app the backend calls
 * into the Rust command layer, which holds the `.synctex.gz` bytes in process
 * and runs the lookup there. In a plain browser and in tests a no-op backend
 * stands in, returning `null` for every query, so the editor remains usable
 * without SyncTeX data — the same seam pattern as {@link LanguageBackend}.
 *
 * The raw coordinate values (scaled points, page number) are passed through
 * unchanged from Rust; the {@link syncTexToCanvas} helper in `pdf.ts` converts
 * them to canvas pixels. Keeping the conversion in pure TypeScript lets it be
 * unit-tested without a real PDF or Rust process.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './project-backend';

/** A PDF rectangle returned by forward search (coordinates in scaled points). */
export interface SyncTexBox {
  /** 1-based PDF page number. */
  page: number;
  /** Horizontal position from the left margin, in scaled points. */
  h: number;
  /** Vertical position from the top of the page, in scaled points. */
  v: number;
  /** Width of the box, in scaled points. */
  w: number;
  /** Depth of the box (below the baseline), in scaled points. */
  d: number;
  /** Height of the page, in scaled points (needed for coordinate conversion). */
  page_height: number;
}

/** A source location returned by inverse search. */
export interface SyncTexLocation {
  /** Absolute path of the source file. */
  file: string;
  /** 1-based line number. */
  line: number;
}

/** Forward and inverse SyncTeX navigation. */
export interface SyncTexBackend {
  /**
   * Find the PDF rectangle for `file` at the given 1-based `line`.
   * Returns `null` when no SyncTeX data is available or no record matches.
   */
  forward(file: string, line: number): Promise<SyncTexBox | null>;
  /**
   * Find the source location closest to the given position on `page`.
   * `x` and `y` are in PDF user-space points (bottom-left origin).
   * Returns `null` when no SyncTeX data is available or no record matches.
   */
  inverse(page: number, x: number, y: number): Promise<SyncTexLocation | null>;
}

/** The backend backed by the Tauri command layer. */
export function tauriSyncTexBackend(): SyncTexBackend {
  return {
    forward(file, line) {
      return invoke<SyncTexBox | null>('synctex_forward', { file, line });
    },
    inverse(page, x, y) {
      return invoke<SyncTexLocation | null>('synctex_inverse', { page, x, y });
    }
  };
}

/** A no-op backend for the browser and tests — always returns `null`. */
export function browserSyncTexBackend(): SyncTexBackend {
  return {
    async forward() {
      return null;
    },
    async inverse() {
      return null;
    }
  };
}

/** Pick the right backend for the current runtime. */
export function selectSyncTexBackend(win: Window = window): SyncTexBackend {
  return isTauri(win) ? tauriSyncTexBackend() : browserSyncTexBackend();
}
