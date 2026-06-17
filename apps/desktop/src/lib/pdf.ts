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
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
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
