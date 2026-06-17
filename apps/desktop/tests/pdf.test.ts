import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, controllable PDF.js mock state.
const mock = vi.hoisted(() => ({ numPages: 1 }));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.js' }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: mock.numPages,
      getPage: () =>
        Promise.resolve({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 120 * scale,
            height: 160 * scale
          }),
          render: () => ({
            promise: Promise.resolve()
          })
        })
    })
  })
}));

import { pdfjsRenderer } from '../src/lib/pdf';

describe('pdfjsRenderer', () => {
  beforeEach(() => {
    mock.numPages = 1;
  });

  it('renders a page onto the canvas and reports the page count', async () => {
    mock.numPages = 3;
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as unknown as CanvasRenderingContext2D);

    const result = await pdfjsRenderer().render(new Uint8Array([1, 2, 3]), canvas, 1, 1.5);

    expect(result.pageCount).toBe(3);
    expect(canvas.width).toBe(180); // 120 * 1.5
    expect(canvas.height).toBe(240); // 160 * 1.5
  });

  it('throws when the canvas has no 2D context', async () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);

    await expect(pdfjsRenderer().render(new Uint8Array(), canvas, 1, 1)).rejects.toThrow(
      '2D context'
    );
  });
});
