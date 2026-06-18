<script lang="ts">
  // The document structure panel: shows the include tree (files referenced by
  // \input/\include/\subfile), the structural outline from the language server,
  // and a search bar for jump-to-anything navigation. The flattened symbol rows
  // come from `flattenSymbols` (pure, in language-backend.ts); filtered results
  // are derived from the search term. LSP lines are zero-based; the parent
  // converts to one-based when it calls the editor's `gotoLine`.
  import { type DocumentSymbol, type OutlineRow, flattenSymbols } from './language-backend';

  let {
    symbols,
    includes,
    onjump,
    onopenfile
  }: {
    symbols: DocumentSymbol[];
    includes: string[];
    onjump: (line: number) => void;
    onopenfile: (path: string) => void;
  } = $props();

  let expanded = $state(true);
  let search = $state('');

  const allRows = $derived(flattenSymbols(symbols));

  const filteredRows = $derived(
    search.trim().length === 0
      ? allRows
      : allRows.filter((row) => row.symbol.name.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredIncludes = $derived(
    search.trim().length === 0
      ? includes
      : includes.filter((p) => p.toLowerCase().includes(search.toLowerCase()))
  );

  const hasContent = $derived(filteredRows.length > 0 || filteredIncludes.length > 0);
  const totalItems = $derived(allRows.length + includes.length);

  function summaryText(): string {
    if (totalItems === 0) return 'Empty';
    const parts: string[] = [];
    if (includes.length > 0)
      parts.push(`${includes.length} file${includes.length === 1 ? '' : 's'}`);
    if (allRows.length > 0)
      parts.push(`${allRows.length} symbol${allRows.length === 1 ? '' : 's'}`);
    return parts.join(', ');
  }

  function indentStyle(row: OutlineRow): string {
    return `padding-left: ${row.depth * 16 + 16}px`;
  }
</script>

<section class="structure" aria-label="Structure">
  <header class="bar">
    <button
      type="button"
      class="header-toggle"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <span class="title">Structure</span>
      <span class="summary">{summaryText()}</span>
    </button>
  </header>

  {#if expanded}
    <div class="search-bar">
      <input
        type="search"
        class="search-input"
        placeholder="Jump to…"
        aria-label="Jump to symbol or file"
        bind:value={search}
      />
    </div>

    {#if filteredIncludes.length > 0}
      <div class="section-label">Includes</div>
      <ul class="list">
        {#each filteredIncludes as path (path)}
          <li class="row kind-file">
            <button type="button" class="entry" onclick={() => onopenfile(path)}>
              <span class="name">{path}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if filteredRows.length > 0}
      {#if filteredIncludes.length > 0}
        <div class="section-label">Outline</div>
      {/if}
      <ul class="list">
        {#each filteredRows as row (row.symbol.line + '/' + row.symbol.name)}
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
    {:else if !hasContent}
      <p class="empty">
        {search.trim().length > 0
          ? 'No matches.'
          : 'No structure yet — compile to map the document.'}
      </p>
    {/if}
  {/if}
</section>

<style>
  .structure {
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

  .search-bar {
    padding: var(--galley-space-2) var(--galley-space-4);
    border-top: var(--galley-border-thin) solid var(--border);
  }

  .search-input {
    width: 100%;
    padding: var(--galley-space-1) var(--galley-space-3);
    background: var(--bg-sunken);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: 2px;
    color: var(--fg);
    font: inherit;
    font-size: var(--galley-text-xs);
    font-family: var(--galley-font-mono);
    box-sizing: border-box;
  }

  .search-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }

  .section-label {
    padding: var(--galley-space-1) var(--galley-space-4);
    font-size: var(--galley-text-xs);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
    color: var(--fg-faint);
    border-top: var(--galley-border-thin) solid var(--border);
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

  .row.kind-file {
    border-left-color: var(--fg-muted);
  }

  .entry {
    display: flex;
    align-items: baseline;
    gap: var(--galley-space-3);
    width: 100%;
    padding-top: var(--galley-space-2);
    padding-bottom: var(--galley-space-2);
    padding-right: var(--galley-space-4);
    padding-left: var(--galley-space-4);
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
    font-family: var(--galley-font-mono);
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
