<script lang="ts">
  import { Logo } from '@galley/ui-kit';
  import { pdfjsRenderer, syncTexToCanvas, canvasToPdfPoint, type PdfRenderer } from './pdf';
  import type { SyncTexBox } from './synctex-backend';
  import type { CompileStatus } from './project-store';
  import { compileTiming } from './timing';

  // The PDF-viewer chrome plus the live proof. PDF.js renders the compiled PDF
  // onto a canvas; the renderer is built behind a factory so the component is
  // driven with a fake in tests (the real renderer is covered in `pdf.test.ts`).
  let {
    status,
    log,
    pdf,
    durationMs = null,
    cached = false,
    highlightBox = null,
    oninversesearch = undefined,
    createRenderer = pdfjsRenderer
  }: {
    status: CompileStatus;
    log: string;
    pdf: Uint8Array | null;
    durationMs?: number | null;
    cached?: boolean;
    /** The SyncTeX rectangle to highlight, set by forward search. */
    highlightBox?: SyncTexBox | null;
    /** Called when the user clicks the PDF canvas for inverse search. */
    oninversesearch?: (page: number, x: number, y: number) => void;
    createRenderer?: () => PdfRenderer;
  } = $props();

  const SCALE = 1.5;
  const STATUS_LABELS: Record<CompileStatus, string> = {
    idle: 'No proof',
    running: 'Compiling…',
    ok: 'Proof',
    failed: 'Failed'
  };

  let pageCount = $state(0);
  let renderError = $state<string | null>(null);
  // Canvas buffer dimensions, kept in sync after each render for the SVG viewBox.
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  // Whether the highlight is visible (fades out after 2 s).
  let highlightVisible = $state(false);
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  const statusLabel = $derived(STATUS_LABELS[status]);
  const timingLabel = $derived(compileTiming(durationMs, cached));
  const pageLabel = $derived(pageCount > 0 ? `1 / ${pageCount}` : '— / —');

  // Show the highlight for 2 s whenever `highlightBox` changes.
  $effect(() => {
    if (highlightBox !== null) {
      highlightVisible = true;
      if (fadeTimer !== null) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        highlightVisible = false;
        fadeTimer = null;
      }, 2000);
    }
  });

  // Derive the SVG rect position from the highlight box (in buffer pixels).
  const svgRect = $derived(
    highlightBox !== null && highlightVisible
      ? syncTexToCanvas(highlightBox, SCALE)
      : null
  );

  // A Svelte action: (re)render the proof whenever the canvas mounts or the PDF
  // bytes change. The renderer is built here (not in the component body) so it
  // reads the latest `createRenderer` without capturing only its initial value.
  function renderProof(node: HTMLCanvasElement, bytes: Uint8Array) {
    const renderer = createRenderer();
    const draw = (data: Uint8Array) => {
      renderError = null;
      renderer
        .render(data, node, 1, SCALE)
        .then((result) => {
          pageCount = result.pageCount;
          canvasWidth = node.width;
          canvasHeight = node.height;
        })
        .catch((error) => {
          const reason = error instanceof Error ? error.message : String(error);
          renderError = `Could not render the proof: ${reason}`;
        });
    };
    draw(bytes);
    return {
      update(next: Uint8Array) {
        draw(next);
      }
    };
  }

  function handleCanvasClick(event: MouseEvent) {
    if (oninversesearch === undefined) return;
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    // Scale from CSS pixels to buffer pixels.
    const displayScale = rect.width > 0 ? canvas.width / rect.width : 1;
    const canvasX = (event.clientX - rect.left) * displayScale;
    const canvasY = (event.clientY - rect.top) * displayScale;
    const { x, y } = canvasToPdfPoint(canvasX, canvasY, canvas.height, SCALE);
    oninversesearch(1, x, y);
  }


</script>

<section class="preview" aria-label="Preview">
  <header class="viewer-bar">
    <span class="status">{statusLabel}</span>
    <span class="timing">{timingLabel}</span>
    <span class="pages">{pageLabel}</span>
    <span class="zoom">150%</span>
  </header>
  <div class="proof">
    {#if pdf !== null}
      <div class="page-wrap">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <canvas
          class="page"
          use:renderProof={pdf}
          aria-label="Proof"
          onclick={handleCanvasClick}
        ></canvas>
        {#if svgRect !== null}
          <svg
            class="synctex-overlay"
            viewBox="0 0 {canvasWidth} {canvasHeight}"
            aria-hidden="true"
          >
            <rect
              x={svgRect.x}
              y={svgRect.y}
              width={svgRect.width}
              height={svgRect.height}
              class="synctex-highlight"
            />
          </svg>
        {/if}
      </div>
      <p class="render-error" role="alert">{renderError}</p>
      {#if status === 'failed'}
        <div class="stale" role="status">
          <p class="note">Showing the last good proof — the latest build failed.</p>
          <pre class="log" aria-label="Compile log">{log}</pre>
        </div>
      {/if}
    {:else if status === 'failed'}
      <div class="failed">
        <p class="empty">That didn't compile.</p>
        <pre class="log" aria-label="Compile log">{log}</pre>
      </div>
    {:else if status === 'running'}
      <div class="placeholder">
        <p class="empty">Pulling a proof…</p>
      </div>
    {:else}
      <div class="placeholder">
        <Logo size={48} title="" />
        <p class="empty">Nothing to proof yet.</p>
        <p class="hint">Your live galley proof shows here once a document compiles.</p>
      </div>
    {/if}
  </div>
</section>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    background: var(--surface);
  }

  .viewer-bar {
    display: flex;
    align-items: center;
    gap: var(--galley-space-4);
    height: var(--galley-titlebar-height);
    padding: 0 var(--galley-space-4);
    border-bottom: var(--galley-border-thin) solid var(--border);
    font-size: var(--galley-text-xs);
    letter-spacing: var(--galley-tracking-wide);
    color: var(--fg-muted);
  }

  .viewer-bar .status {
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
  }

  .viewer-bar .timing {
    color: var(--fg-faint);
  }

  /* Hidden until there is a duration (or "cached") to show. */
  .viewer-bar .timing:empty {
    display: none;
  }

  .viewer-bar .pages {
    margin-left: auto;
  }

  .proof {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--galley-space-3);
    overflow: auto;
    padding: var(--galley-space-4);
    background: var(--bg-sunken);
  }

  .page-wrap {
    position: relative;
    display: inline-block;
    line-height: 0;
  }

  .page {
    max-width: 100%;
    height: auto;
    background: var(--galley-paper);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
    cursor: crosshair;
    display: block;
  }

  .synctex-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .synctex-highlight {
    fill: var(--ribbon, #a8362b);
    opacity: 0.35;
    animation: synctex-fade 2s ease-out forwards;
  }

  @keyframes synctex-fade {
    0% { opacity: 0.35; }
    70% { opacity: 0.35; }
    100% { opacity: 0; }
  }

  .render-error,
  .failed {
    color: var(--accent-text);
    font-size: var(--galley-text-sm);
    text-align: center;
  }

  .stale {
    width: 100%;
    text-align: center;
  }

  .stale .note {
    margin: 0 0 var(--galley-space-2);
    color: var(--accent-text);
    font-size: var(--galley-text-xs);
  }

  /* Hidden until the renderer reports a problem. */
  .render-error:empty {
    display: none;
  }

  .log {
    max-width: 48ch;
    margin: var(--galley-space-2) 0 0;
    padding: var(--galley-space-3);
    overflow: auto;
    background: var(--galley-carbon);
    color: var(--galley-paper);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    text-align: left;
    white-space: pre-wrap;
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--galley-space-2);
    text-align: center;
    opacity: 0.85;
  }

  .empty {
    margin: var(--galley-space-2) 0 0;
    color: var(--fg-muted);
    font-size: var(--galley-text-sm);
  }

  .hint {
    margin: 0;
    max-width: 26ch;
    color: var(--fg-faint);
    font-size: var(--galley-text-xs);
    line-height: var(--galley-leading-normal);
  }
</style>
