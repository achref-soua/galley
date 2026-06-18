<script lang="ts">
  // The document outline: the structural symbols the language server reports
  // (sections, environments), flattened into an indented, clickable list that
  // jumps the editor to the source line. The flattening lives in
  // `language-backend.ts`; this component just renders it. Lines are zero-based
  // (LSP); the parent converts to Galley's one-based line when jumping.
  import { type DocumentSymbol, type OutlineRow, flattenSymbols } from './language-backend';

  let {
    symbols,
    onjump
  }: {
    symbols: DocumentSymbol[];
    onjump: (line: number) => void;
  } = $props();

  let expanded = $state(true);

  const rows = $derived(flattenSymbols(symbols));
  const hasSymbols = $derived(rows.length > 0);

  function indentStyle(row: OutlineRow): string {
    return `padding-left: ${row.depth * 16 + 16}px`;
  }
</script>

<section class="outline" aria-label="Outline">
  <header class="bar">
    <button
      type="button"
      class="header-toggle"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <span class="title">Outline</span>
      <span class="summary">{hasSymbols ? `${rows.length} items` : 'Empty'}</span>
    </button>
  </header>

  {#if expanded && hasSymbols}
    <ul class="list">
      {#each rows as row}
        <li class={'row kind-' + row.symbol.kind}>
          <button
            type="button"
            class="entry"
            style={indentStyle(row)}
            onclick={() => onjump(row.symbol.line)}
          >
            <span class="name">{row.symbol.name}</span>
            {#if row.symbol.detail !== null}
              <span class="detail">{row.symbol.detail}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else if expanded}
    <p class="empty">No outline yet — compile to map the document.</p>
  {/if}
</section>

<style>
  .outline {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: none;
    border-top: var(--galley-border-thin) solid var(--border);
    background: var(--surface);
  }

  .bar {
    display: flex;
    align-items: stretch;
    height: var(--galley-titlebar-height);
  }

  .header-toggle {
    display: flex;
    align-items: center;
    gap: var(--galley-space-3);
    width: 100%;
    padding: 0 var(--galley-space-4);
    border: none;
    background: none;
    color: var(--fg-muted);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .header-toggle:hover {
    color: var(--fg);
  }

  .title {
    font-size: var(--galley-text-xs);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
  }

  .summary {
    font-size: var(--galley-text-xs);
    color: var(--fg-faint);
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: auto;
    max-height: 11rem;
  }

  .row {
    border-top: var(--galley-border-thin) solid var(--border);
    border-left: 2px solid transparent;
  }

  .row.kind-section {
    border-left-color: var(--accent);
  }

  .row.kind-environment {
    border-left-color: var(--syn-keyword);
  }

  .entry {
    display: flex;
    align-items: baseline;
    gap: var(--galley-space-3);
    width: 100%;
    padding-top: var(--galley-space-2);
    padding-bottom: var(--galley-space-2);
    padding-right: var(--galley-space-4);
    border: none;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .entry:hover {
    background: var(--bg-sunken);
  }

  .name {
    flex: 1 1 auto;
    font-size: var(--galley-text-sm);
  }

  .detail {
    flex: none;
    color: var(--fg-faint);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-3) var(--galley-space-4);
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
  }
</style>
