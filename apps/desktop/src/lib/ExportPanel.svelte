<script lang="ts">
  import type { ImportBackend } from './import-backend';
  import type { ExportBackend, PandocFormat } from './export-backend';

  interface Props {
    open: boolean;
    projectRoot: string;
    projectName: string;
    rootDocument: string;
    /** Compiled PDF bytes from the last successful compile. Null when no compile has run yet. */
    pdfBytes: Uint8Array | null;
    importBackend: ImportBackend;
    exportBackend: ExportBackend;
    onclose: () => void;
  }

  let {
    open,
    projectRoot,
    projectName,
    rootDocument,
    pdfBytes,
    importBackend,
    exportBackend,
    onclose
  }: Props = $props();

  let status = $state<string>('');
  let busy = $state(false);

  const hasPdf = $derived(pdfBytes !== null);

  async function run(label: string, action: () => Promise<void>) {
    busy = true;
    status = '';
    try {
      await action();
      status = label + ' complete.';
    } catch (err) {
      status = String(err);
    } finally {
      busy = false;
    }
  }

  async function exportPdf() {
    const dest = await importBackend.pickSavePath(projectName + '.pdf', [
      { name: 'PDF', extensions: ['pdf'] }
    ]);
    if (!dest) return;
    await run('PDF export', () => exportBackend.savePdf(pdfBytes!, dest));
  }

  async function exportBundle() {
    const dest = await importBackend.pickSavePath(projectName + '.zip', [
      { name: 'ZIP Archive', extensions: ['zip'] }
    ]);
    if (!dest) return;
    await run('Source bundle export', () =>
      importBackend.exportBundleTo(projectRoot, dest).then(() => {})
    );
  }

  async function exportShareBundle() {
    const dest = await importBackend.pickSavePath(projectName + '-share.zip', [
      { name: 'ZIP Archive', extensions: ['zip'] }
    ]);
    if (!dest) return;
    await run('Share bundle export', () =>
      exportBackend.saveShareBundle(projectRoot, pdfBytes!, dest).then(() => {})
    );
  }

  async function exportPandoc(format: PandocFormat, label: string, ext: string) {
    const dest = await importBackend.pickSavePath(projectName + '.' + ext, [
      { name: label, extensions: [ext] }
    ]);
    if (!dest) return;
    await run(label + ' export', () =>
      exportBackend.runPandoc(projectRoot, rootDocument, format, dest)
    );
  }

  function doPrint() {
    exportBackend.print(pdfBytes!);
  }

  function dismiss() {
    status = '';
    onclose();
  }
</script>

{#if open}
  <div
    class="export-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Export"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Escape') dismiss();
    }}
  >
    <div class="export-panel">
      <header class="export-header">
        <span class="export-title">Export</span>
        <button class="close-btn" onclick={dismiss} aria-label="Close export panel">✕</button>
      </header>

      <div class="export-grid">
        <!-- PDF -->
        <div class="export-card" class:disabled={!hasPdf}>
          <div class="card-icon">📄</div>
          <div class="card-body">
            <strong>PDF</strong>
            <small>Save the compiled document</small>
          </div>
          <button
            class="card-btn"
            onclick={exportPdf}
            disabled={!hasPdf || busy}
            aria-label="Export PDF">Export</button
          >
        </div>

        <!-- Source bundle -->
        <div class="export-card">
          <div class="card-icon">📦</div>
          <div class="card-body">
            <strong>Source Bundle</strong>
            <small>Clean ZIP — Overleaf-ready</small>
          </div>
          <button
            class="card-btn"
            onclick={exportBundle}
            disabled={busy}
            aria-label="Export source bundle">Export</button
          >
        </div>

        <!-- Share bundle -->
        <div class="export-card" class:disabled={!hasPdf}>
          <div class="card-icon">🗂️</div>
          <div class="card-body">
            <strong>Share Bundle</strong>
            <small>Source + PDF in one ZIP</small>
          </div>
          <button
            class="card-btn"
            onclick={exportShareBundle}
            disabled={!hasPdf || busy}
            aria-label="Export share bundle">Export</button
          >
        </div>

        <!-- Print -->
        <div class="export-card" class:disabled={!hasPdf}>
          <div class="card-icon">🖨️</div>
          <div class="card-body">
            <strong>Print</strong>
            <small>Open the system print dialog</small>
          </div>
          <button
            class="card-btn"
            onclick={doPrint}
            disabled={!hasPdf || busy}
            aria-label="Print document">Print</button
          >
        </div>

        <!-- HTML -->
        <div class="export-card pandoc-card">
          <div class="card-icon">🌐</div>
          <div class="card-body">
            <strong>HTML</strong>
            <small>Via Pandoc (pandoc required)</small>
          </div>
          <button
            class="card-btn"
            onclick={() => exportPandoc('html5', 'HTML', 'html')}
            disabled={busy}
            aria-label="Export HTML">Export</button
          >
        </div>

        <!-- Word -->
        <div class="export-card pandoc-card">
          <div class="card-icon">📝</div>
          <div class="card-body">
            <strong>Word</strong>
            <small>Via Pandoc (.docx, pandoc required)</small>
          </div>
          <button
            class="card-btn"
            onclick={() => exportPandoc('docx', 'Word', 'docx')}
            disabled={busy}
            aria-label="Export Word document">Export</button
          >
        </div>

        <!-- Markdown -->
        <div class="export-card pandoc-card">
          <div class="card-icon">✍️</div>
          <div class="card-body">
            <strong>Markdown</strong>
            <small>Via Pandoc (.md, pandoc required)</small>
          </div>
          <button
            class="card-btn"
            onclick={() => exportPandoc('markdown', 'Markdown', 'md')}
            disabled={busy}
            aria-label="Export Markdown">Export</button
          >
        </div>
      </div>

      {#if status}
        <div class="export-status" role="status">{status}</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .export-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
  }

  .export-panel {
    background: var(--surface-2, var(--paper));
    border: 1px solid var(--graphite);
    border-radius: 6px;
    width: 560px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .export-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--graphite);
  }

  .export-title {
    font-family: var(--font-mono, monospace);
    font-size: 1rem;
    font-weight: 600;
    color: var(--ink);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    color: var(--muted);
    padding: 0.25rem 0.5rem;
  }

  .close-btn:hover {
    color: var(--ink);
  }

  .export-grid {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .export-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid var(--graphite);
    transition: background 0.1s;
  }

  .export-card:last-child {
    border-bottom: none;
  }

  .export-card.disabled {
    opacity: 0.45;
  }

  .export-card.pandoc-card {
    background: var(--surface-1, transparent);
  }

  .card-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
    width: 2rem;
    text-align: center;
  }

  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .card-body strong {
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    color: var(--ink);
  }

  .card-body small {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .card-btn {
    font-family: var(--font-mono, monospace);
    font-size: 0.8rem;
    padding: 0.375rem 0.875rem;
    background: var(--ink);
    color: var(--paper);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .card-btn:hover:not(:disabled) {
    background: var(--ribbon);
  }

  .card-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .export-status {
    padding: 0.625rem 1.25rem;
    font-size: 0.8rem;
    color: var(--ribbon);
    font-family: var(--font-mono, monospace);
    border-top: 1px solid var(--graphite);
  }
</style>
