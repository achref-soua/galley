import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import PreviewPane from '../src/lib/PreviewPane.svelte';
import type { PdfRenderer } from '../src/lib/pdf';

/** Build a fake renderer factory from a render implementation. */
function rendererWith(impl: PdfRenderer['render']): () => PdfRenderer {
  return () => ({ render: impl });
}

describe('PreviewPane', () => {
  it('shows the idle placeholder when nothing has compiled', () => {
    render(PreviewPane, { props: { status: 'idle', log: '', pdf: null } });
    expect(screen.getByText('Nothing to proof yet.')).toBeTruthy();
    expect(screen.getByText('No proof', { exact: true })).toBeTruthy();
    expect(screen.getByText('— / —')).toBeTruthy();
  });

  it('shows a compiling state', () => {
    render(PreviewPane, { props: { status: 'running', log: '', pdf: null } });
    expect(screen.getByText('Pulling a proof…')).toBeTruthy();
    expect(screen.getByText('Compiling…')).toBeTruthy();
  });

  it('shows the log when a compile failed', () => {
    render(PreviewPane, {
      props: { status: 'failed', log: '! Undefined control sequence.', pdf: null }
    });
    expect(screen.getByText("That didn't compile.")).toBeTruthy();
    expect(screen.getByLabelText('Compile log').textContent).toContain(
      'Undefined control sequence'
    );
    expect(screen.getByText('Failed', { exact: true })).toBeTruthy();
  });

  it('renders the proof onto a canvas and shows the page count and timing', async () => {
    render(PreviewPane, {
      props: {
        status: 'ok',
        log: 'ok',
        pdf: new Uint8Array([1]),
        durationMs: 420,
        cached: false,
        createRenderer: rendererWith(() => Promise.resolve({ pageCount: 2 }))
      }
    });
    expect(screen.getByLabelText('Proof')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 / 2')).toBeTruthy());
    expect(screen.getByText('Proof', { exact: true })).toBeTruthy();
    expect(screen.getByText('420 ms')).toBeTruthy();
  });

  it('shows "cached" when the proof came from the cache', () => {
    render(PreviewPane, {
      props: {
        status: 'ok',
        log: 'ok',
        pdf: new Uint8Array([1]),
        durationMs: 5,
        cached: true,
        createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 }))
      }
    });
    expect(screen.getByText('cached')).toBeTruthy();
  });

  it('keeps the last proof on screen and notes the failure when a rebuild fails', () => {
    render(PreviewPane, {
      props: {
        status: 'failed',
        log: '! Missing $ inserted.',
        pdf: new Uint8Array([1]),
        durationMs: 12,
        cached: false,
        createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 }))
      }
    });
    // The proof canvas is still shown...
    expect(screen.getByLabelText('Proof')).toBeTruthy();
    // ...alongside a note and the failing log.
    expect(screen.getByText('Showing the last good proof — the latest build failed.')).toBeTruthy();
    expect(screen.getByLabelText('Compile log').textContent).toContain('Missing $ inserted');
  });

  it('reports a render failure carrying an Error message', async () => {
    render(PreviewPane, {
      props: {
        status: 'ok',
        log: 'ok',
        pdf: new Uint8Array([1]),
        createRenderer: rendererWith(() => Promise.reject(new Error('bad pdf')))
      }
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('bad pdf'));
  });

  it('reports a render failure that is not an Error', async () => {
    render(PreviewPane, {
      props: {
        status: 'ok',
        log: 'ok',
        pdf: new Uint8Array([1]),
        createRenderer: rendererWith(() => Promise.reject('boom'))
      }
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('boom'));
  });

  it('re-renders when the PDF bytes change', async () => {
    const sizes: number[] = [];
    const create = rendererWith((data) => {
      sizes.push(data.length);
      return Promise.resolve({ pageCount: sizes.length });
    });
    const { rerender } = render(PreviewPane, {
      props: { status: 'ok', log: '', pdf: new Uint8Array([1]), createRenderer: create }
    });
    await waitFor(() => expect(sizes).toEqual([1]));
    await rerender({
      status: 'ok',
      log: '',
      pdf: new Uint8Array([1, 2, 3]),
      createRenderer: create
    });
    await waitFor(() => expect(sizes).toEqual([1, 3]));
  });

  it('shows an SVG highlight when highlightBox is set', async () => {
    const box = { page: 1, h: 65781, v: 131563, w: 65781, d: 6578, page_height: 200000 };
    // Give the canvas real pixel dimensions so canvasWidth/canvasHeight are non-zero
    // when the renderProof .then callback fires, exercising the viewBox update branch.
    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
      get() { return 800; }, configurable: true
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
      get() { return 1100; }, configurable: true
    });
    const { rerender } = render(PreviewPane, {
      props: {
        status: 'ok',
        log: '',
        pdf: new Uint8Array([1]),
        highlightBox: null,
        createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 }))
      }
    });
    await rerender({ status: 'ok', log: '', pdf: new Uint8Array([1]), highlightBox: box,
      createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 })) });
    await waitFor(() => expect(document.querySelector('.synctex-highlight')).not.toBeNull());
    // Restore canvas prototype to avoid affecting other tests.
    delete (HTMLCanvasElement.prototype as { width?: unknown }).width;
    delete (HTMLCanvasElement.prototype as { height?: unknown }).height;
  });

  it('calls oninversesearch when the canvas is clicked', async () => {
    const calls: [number, number, number][] = [];
    render(PreviewPane, {
      props: {
        status: 'ok',
        log: '',
        pdf: new Uint8Array([1]),
        oninversesearch: (page: number, x: number, y: number) => { calls.push([page, x, y]); },
        createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 }))
      }
    });
    await waitFor(() => expect(screen.getByLabelText('Proof')).toBeTruthy());
    const canvas = screen.getByLabelText('Proof') as HTMLCanvasElement;
    // Provide real CSS dimensions so the rect.width > 0 branch in handleCanvasClick is taken.
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      width: 100, height: 150, left: 10, top: 20, right: 110, bottom: 170, x: 10, y: 20,
      toJSON: () => ({})
    } as DOMRect);
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 80 }));
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(1);
  });

  it('does nothing when the canvas is clicked without an oninversesearch handler', async () => {
    render(PreviewPane, {
      props: {
        status: 'ok',
        log: '',
        pdf: new Uint8Array([1]),
        createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 }))
      }
    });
    await waitFor(() => expect(screen.getByLabelText('Proof')).toBeTruthy());
    const canvas = screen.getByLabelText('Proof') as HTMLCanvasElement;
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  it('hides the highlight after the 2 s fade', async () => {
    vi.useFakeTimers();
    const box = { page: 1, h: 65781, v: 131563, w: 65781, d: 6578, page_height: 200000 };
    const { rerender } = render(PreviewPane, {
      props: {
        status: 'ok', log: '', pdf: new Uint8Array([1]),
        highlightBox: null,
        createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 }))
      }
    });
    await rerender({ status: 'ok', log: '', pdf: new Uint8Array([1]), highlightBox: box,
      createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 })) });
    await waitFor(() => expect(document.querySelector('.synctex-highlight')).not.toBeNull());
    vi.advanceTimersByTime(2001);
    await waitFor(() => expect(document.querySelector('.synctex-highlight')).toBeNull());
    vi.useRealTimers();
  });

  it('clears the previous timer when a second highlight arrives', async () => {
    vi.useFakeTimers();
    const box1 = { page: 1, h: 65781, v: 131563, w: 65781, d: 6578, page_height: 200000 };
    const box2 = { page: 1, h: 131563, v: 262000, w: 65781, d: 6578, page_height: 200000 };
    const { rerender } = render(PreviewPane, {
      props: {
        status: 'ok', log: '', pdf: new Uint8Array([1]),
        highlightBox: box1,
        createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 }))
      }
    });
    await waitFor(() => expect(document.querySelector('.synctex-highlight')).not.toBeNull());
    // A second highlight arrives while the first timer is still pending.
    await rerender({ status: 'ok', log: '', pdf: new Uint8Array([1]), highlightBox: box2,
      createRenderer: rendererWith(() => Promise.resolve({ pageCount: 1 })) });
    await waitFor(() => expect(document.querySelector('.synctex-highlight')).not.toBeNull());
    vi.useRealTimers();
  });
});
