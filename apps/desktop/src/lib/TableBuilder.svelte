<script lang="ts">
  import { buildTabular, buildBooktabs, type Align, type TableStyle } from './table.js';

  function range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  interface Props {
    /** Fired with the generated LaTeX string when the user confirms. */
    oninsert: (latex: string) => void;
    /** Fired when the user cancels without inserting. */
    oncancel: () => void;
  }

  let { oninsert, oncancel }: Props = $props();

  const MAX_COLS = 8;
  const MAX_ROWS = 12;

  let cols = $state(3);
  let rows = $state(2);
  let style = $state<TableStyle>('tabular');
  let alignments = $state<Align[]>(['l', 'c', 'r']);
  let headerRow = $state<string[]>(['Header 1', 'Header 2', 'Header 3']);
  let dataRows = $state<string[][]>([
    ['', '', ''],
    ['', '', '']
  ]);

  function setCols(n: number) {
    const next = Math.max(1, Math.min(MAX_COLS, n));
    const diff = next - alignments.length;
    alignments = alignments
      .slice(0, next)
      .concat(diff > 0 ? (Array(diff).fill('c') as Align[]) : []);
    headerRow = headerRow
      .slice(0, next)
      .concat(diff > 0 ? Array(diff).fill(`Header ${alignments.length}`) : []);
    dataRows = dataRows.map((row) =>
      row.slice(0, next).concat(diff > 0 ? Array(diff).fill('') : [])
    );
    cols = next;
  }

  function setRows(n: number) {
    const next = Math.max(1, Math.min(MAX_ROWS, n));
    if (next > dataRows.length) {
      const add = Array.from({ length: next - dataRows.length }, () =>
        Array<string>(cols).fill('')
      );
      dataRows = [...dataRows, ...add];
    } else {
      dataRows = dataRows.slice(0, next);
    }
    rows = next;
  }

  function setAlignment(col: number, align: Align) {
    const next = [...alignments];
    next[col] = align;
    alignments = next;
  }

  function setHeader(col: number, value: string) {
    const next = [...headerRow];
    next[col] = value;
    headerRow = next;
  }

  function setCell(row: number, col: number, value: string) {
    const next = dataRows.map((r) => [...r]);
    next[row][col] = value;
    dataRows = next;
  }

  const preview = $derived(
    style === 'booktabs'
      ? buildBooktabs(alignments, headerRow, dataRows)
      : buildTabular(alignments, [headerRow, ...dataRows])
  );

  function insert() {
    oninsert(preview);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      oncancel();
    }
  }
</script>

<div
  class="table-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Table builder"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <div class="table-panel">
    <h2 class="table-title">Table builder</h2>

    <div class="table-controls">
      <label class="ctrl-label">
        Columns
        <input
          type="number"
          class="ctrl-input"
          min="1"
          max={MAX_COLS}
          value={cols}
          onchange={(e) => setCols(Number((e.currentTarget as HTMLInputElement).value))}
        />
      </label>
      <label class="ctrl-label">
        Rows
        <input
          type="number"
          class="ctrl-input"
          min="1"
          max={MAX_ROWS}
          value={rows}
          onchange={(e) => setRows(Number((e.currentTarget as HTMLInputElement).value))}
        />
      </label>
      <label class="ctrl-label">
        Style
        <select
          class="ctrl-select"
          onchange={(e) => {
            style = (e.currentTarget as HTMLSelectElement).value as TableStyle;
          }}
        >
          <option value="tabular" selected={style === 'tabular'}>tabular</option>
          <option value="booktabs" selected={style === 'booktabs'}>booktabs</option>
        </select>
      </label>
    </div>

    <div class="col-align">
      {#each alignments as align, i}
        <div class="align-label">
          <select
            class="align-select"
            aria-label={`Column ${i + 1} alignment`}
            onchange={(e) => setAlignment(i, (e.currentTarget as HTMLSelectElement).value as Align)}
          >
            <option value="l" selected={align === 'l'}>L</option>
            <option value="c" selected={align === 'c'}>C</option>
            <option value="r" selected={align === 'r'}>R</option>
          </select>
        </div>
      {/each}
    </div>

    <div class="table-grid">
      <div class="grid-header">
        {#each range(cols) as i}
          <input
            type="text"
            class="cell-input cell-header"
            aria-label={`Header ${i + 1}`}
            value={headerRow[i]}
            oninput={(e) => setHeader(i, (e.currentTarget as HTMLInputElement).value)}
          />
        {/each}
      </div>
      {#each dataRows as row, ri}
        <div class="grid-row">
          {#each range(cols) as ci}
            <input
              type="text"
              class="cell-input"
              aria-label={`Row ${ri + 1}, column ${ci + 1}`}
              value={row[ci]}
              oninput={(e) => setCell(ri, ci, (e.currentTarget as HTMLInputElement).value)}
            />
          {/each}
        </div>
      {/each}
    </div>

    <details class="preview-details">
      <summary class="preview-summary">Preview LaTeX</summary>
      <pre class="preview-code">{preview}</pre>
    </details>

    <div class="table-actions">
      <button type="button" class="btn btn-primary" onclick={insert}>Insert</button>
      <button type="button" class="btn" onclick={oncancel}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .table-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .table-panel {
    background: var(--surface);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-lg);
    padding: var(--galley-space-5);
    min-width: 520px;
    max-width: 780px;
    max-height: 90vh;
    width: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-4);
  }

  .table-title {
    margin: 0;
    font-size: var(--galley-text-md);
    font-family: var(--galley-font-mono);
    color: var(--fg);
  }

  .table-controls {
    display: flex;
    gap: var(--galley-space-4);
    align-items: flex-end;
  }

  .ctrl-label {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-1);
    font-size: var(--galley-text-xs);
    font-family: var(--galley-font-mono);
    color: var(--fg-muted);
  }

  .ctrl-input,
  .ctrl-select {
    background: var(--bg-sunken);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-md);
    color: var(--fg);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    padding: var(--galley-space-1) var(--galley-space-2);
  }

  .ctrl-input {
    width: 60px;
  }

  .col-align {
    display: flex;
    gap: var(--galley-space-2);
  }

  .align-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .align-select {
    background: var(--bg-sunken);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-md);
    color: var(--fg);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    padding: 2px var(--galley-space-1);
    width: 44px;
  }

  .table-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .grid-header,
  .grid-row {
    display: flex;
    gap: 2px;
  }

  .cell-input {
    flex: 1 1 0;
    min-width: 0;
    background: var(--bg-sunken);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-sm);
    color: var(--fg);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    padding: var(--galley-space-1) var(--galley-space-2);
  }

  .cell-header {
    border-color: var(--border-strong);
    font-weight: var(--galley-weight-bold);
  }

  .preview-details {
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-md);
    padding: 0;
    overflow: hidden;
  }

  .preview-summary {
    padding: var(--galley-space-2) var(--galley-space-3);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
    cursor: pointer;
    background: var(--bg-sunken);
  }

  .preview-code {
    margin: 0;
    padding: var(--galley-space-3);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    color: var(--fg);
    white-space: pre-wrap;
    overflow-x: auto;
  }

  .table-actions {
    display: flex;
    gap: var(--galley-space-2);
    justify-content: flex-end;
  }

  .btn {
    padding: var(--galley-space-1) var(--galley-space-3);
    border-radius: var(--galley-radius-md);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    cursor: pointer;
    border: var(--galley-border-thin) solid var(--border);
    background: transparent;
    color: var(--fg);
  }

  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--paper);
  }
</style>
