import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, controllable PDF.js mock state. `lastData` records the bytes the last
// getDocument call received, so a test can prove a fresh copy was handed over.
const mock = vi.hoisted(() => ({ numPages: 1, lastData: null as Uint8Array | null }));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.js' }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: ({ data }: { data: Uint8Array }) => {
    // The real PDF.js transfers `data` to its worker, which detaches the backing
    // ArrayBuffer. Emulate that here so the "render twice from the same bytes"
    // regression is genuine rather than relying on an inert mock.
    mock.lastData = data;
    structuredClone(data.buffer, { transfer: [data.buffer] });
    return {
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
    };
  }
}));

import { pdfjsRenderer, syncTexToCanvas, canvasToPdfPoint, SP_PER_PT } from '../src/lib/pdf';

describe('syncTexToCanvas', () => {
  it('converts scaled-point coordinates to canvas pixels at scale 1', () => {
    const box = { page: 1, h: 65781, v: 131563, w: 65781, d: 6578, page_height: 200000 };
    const rect = syncTexToCanvas(box, 1);
    expect(rect.x).toBeCloseTo(65781 / SP_PER_PT, 4);
    expect(rect.y).toBeCloseTo(131563 / SP_PER_PT, 4);
    expect(rect.width).toBeCloseTo(65781 / SP_PER_PT, 4);
    expect(rect.height).toBeCloseTo(6578 / SP_PER_PT, 4);
  });

  it('scales all dimensions by the given scale factor', () => {
    const box = {
      page: 1,
      h: SP_PER_PT * 10,
      v: SP_PER_PT * 20,
      w: SP_PER_PT * 5,
      d: SP_PER_PT * 1,
      page_height: SP_PER_PT * 100
    };
    const rect = syncTexToCanvas(box, 2.0);
    expect(rect.x).toBeCloseTo(20, 5);
    expect(rect.y).toBeCloseTo(40, 5);
    expect(rect.width).toBeCloseTo(10, 5);
    expect(rect.height).toBeCloseTo(2, 5);
  });

  it('returns zero dimensions for a zero-size box', () => {
    const box = { page: 1, h: 0, v: 0, w: 0, d: 0, page_height: 100000 };
    const rect = syncTexToCanvas(box, 1.5);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });
});

describe('canvasToPdfPoint', () => {
  it('flips the y-axis relative to canvas height', () => {
    const { x, y } = canvasToPdfPoint(100, 50, 800, 1.0);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(750); // 800 - 50
  });

  it('applies the scale divisor to both axes', () => {
    const { x, y } = canvasToPdfPoint(200, 100, 1600, 2.0);
    expect(x).toBeCloseTo(100); // 200 / 2
    expect(y).toBeCloseTo(750); // 1600/2 - 100/2 = 800 - 50
  });

  it('returns zero point for a click at the bottom-left of the canvas', () => {
    const { x, y } = canvasToPdfPoint(0, 800, 800, 1.0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0); // bottom-left in PDF space
  });
});

describe('pdfjsRenderer', () => {
  beforeEach(() => {
    mock.numPages = 1;
    mock.lastData = null;
  });

  it('copies the bytes per render so the source buffer is never detached', async () => {
    mock.numPages = 2;
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as unknown as CanvasRenderingContext2D);
    const renderer = pdfjsRenderer();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await renderer.render(bytes, canvas, 1, 1.5);
    // PDF.js detached the *copy* it was handed, not our source buffer. Compare
    // references with `===` (not `toBe`) so the matcher never serialises the now
    // detached array.
    expect(mock.lastData === bytes).toBe(false);
    expect(mock.lastData?.byteLength).toBe(0);
    expect(bytes.byteLength).toBe(4);

    // A second render of the very same bytes still succeeds — this is the bug:
    // before the fix the source buffer was already detached and PDF.js threw.
    const second = await renderer.render(bytes, canvas, 1, 2);
    expect(second.pageCount).toBe(2);
    expect(bytes.byteLength).toBe(4);
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
