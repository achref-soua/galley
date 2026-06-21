/**
 * The PDF.js preview renderer.
 *
 * Rendering a PDF needs a real canvas and the PDF.js worker, neither of which
 * exists under jsdom, so the renderer is built behind a small {@link PdfRenderer}
 * seam: the preview controller and component are driven with a fake in tests,
 * and the real PDF.js adapter is covered with the `pdfjs-dist` module mocked.
 *
 * PDF.js is imported dynamically inside `render`, so it (a stays out of the app's
 * startup bundle until a proof is first shown, and b) is never loaded merely by
 * importing this module — which keeps it out of the jsdom test environment, where
 * its browser-only globals are absent.
 */

import { once } from './startup';
import type { SyncTexBox } from './synctex-backend';

// Memoize the heavy dynamic imports so the PDF.js engine and its worker resolve
// once for the whole session instead of on every page render.
const loadPdfjs = once(() => import('pdfjs-dist'));
const loadPdfWorker = once(() => import('pdfjs-dist/build/pdf.worker.min.mjs?url'));

/**
 * Scaled points per PDF user-space point (72.27 TeX pt/inch × 65536 sp/pt ÷ 72 PDF pt/inch).
 * Matches the Rust constant in `galley-intel::synctex`.
 */
export const SP_PER_PT = 65781.76;

/**
 * Canvas pixel coordinates for a SyncTeX highlight rectangle.
 * Origin is the top-left of the canvas (matching the 2D rendering context).
 */
export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert a {@link SyncTexBox} (scaled-point coordinates, top-left page origin)
 * to canvas pixels at the given `scale`.
 *
 * SyncTeX's `v` is already measured from the top of the page, matching the
 * canvas y-axis, so no y-flip is needed. The depth field `d` is the box height
 * (distance below the baseline), used as the rectangle height for the highlight.
 */
export function syncTexToCanvas(box: SyncTexBox, scale: number): CanvasRect {
  return {
    x: (box.h / SP_PER_PT) * scale,
    y: (box.v / SP_PER_PT) * scale,
    width: (box.w / SP_PER_PT) * scale,
    height: (box.d / SP_PER_PT) * scale
  };
}

/**
 * Convert canvas click coordinates back to PDF user-space points for inverse
 * search. PDF.js renders with the bottom-left origin, so the y-axis is flipped
 * relative to the canvas.
 *
 * @param canvasX - Click x in canvas pixels (from canvas left edge).
 * @param canvasY - Click y in canvas pixels (from canvas top edge).
 * @param canvasHeight - The total canvas height in pixels.
 * @param scale - The current PDF render scale.
 * @returns `{ x, y }` in PDF user-space points (bottom-left origin).
 */
export function canvasToPdfPoint(
  canvasX: number,
  canvasY: number,
  canvasHeight: number,
  scale: number
): { x: number; y: number } {
  return {
    x: canvasX / scale,
    y: canvasHeight / scale - canvasY / scale
  };
}

/** What a render reports back: the document's page count. */
export interface RenderedPdf {
  /** Total number of pages in the document. */
  pageCount: number;
}

/** Renders a page of a PDF onto a canvas. */
export interface PdfRenderer {
  /**
   * Render page `pageNumber` (1-based) of the PDF in `data` onto `canvas` at the
   * given `scale`, returning the document's page count.
   */
  render(
    data: Uint8Array,
    canvas: HTMLCanvasElement,
    pageNumber: number,
    scale: number
  ): Promise<RenderedPdf>;
}

/** The real PDF.js renderer. */
export function pdfjsRenderer(): PdfRenderer {
  return {
    async render(data, canvas, pageNumber, scale) {
      const pdfjs = await loadPdfjs();
      const worker = await loadPdfWorker();
      // Same-origin, bundled worker — allowed under the app's strict CSP.
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

      const doc = await pdfjs.getDocument({ data }).promise;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');
      if (context === null) {
        throw new Error('the canvas 2D context is unavailable');
      }
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      return { pageCount: doc.numPages };
    }
  };
}
