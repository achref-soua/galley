<script lang="ts">
  import { type ProjectBackend, type SearchQuery, type FileMatches } from './project-backend';
  import { searchInContent, replaceInContent } from './search-content';

  let {
    root,
    backend,
    activeContent,
    activePath,
    onclose,
    onreplace
  }: {
    root: string | null;
    backend: ProjectBackend;
    activeContent: string;
    activePath: string | null;
    onclose: () => void;
    onreplace: (path: string, newContent: string) => void;
  } = $props();

  let pattern = $state('');
  let replacement = $state('');
  let caseSensitive = $state(false);
  let wholeWord = $state(false);
  let useRegex = $state(false);
  let searching = $state(false);
  let results = $state<FileMatches[]>([]);
  let error = $state<string | null>(null);

  const query = $derived<SearchQuery>({ pattern, caseSensitive, wholeWord, useRegex });
  const totalMatches = $derived(results.reduce((n, f) => n + f.matches.length, 0));
  const resultsSummary = $derived(
    `${totalMatches} match${totalMatches === 1 ? '' : 'es'} in ${results.length} file${results.length === 1 ? '' : 's'}`
  );

  async function search() {
    if (pattern.trim().length === 0) {
      results = [];
      error = null;
      return;
    }
    if (root === null) {
      results = [];
      return;
    }
    searching = true;
    error = null;
    try {
      results = await backend.searchProject(root, query);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      results = [];
    } finally {
      searching = false;
    }
  }

  async function replaceAll() {
    if (pattern.trim().length === 0 || root === null) {
      return;
    }
    searching = true;
    error = null;
    try {
      for (const fileMatch of results) {
        const current =
          fileMatch.file === activePath
            ? activeContent
            : await backend.readDocument(root, fileMatch.file);
        const updated = replaceInContent(current, query, replacement);
        if (updated !== current) {
          await backend.saveDocument(root, fileMatch.file, updated);
          onreplace(fileMatch.file, updated);
        }
      }
      await search();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      searching = false;
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    }
    if (event.key === 'Enter') {
      void search();
    }
  }
</script>

<div class="search-panel" role="search" aria-label="Project search">
  <div class="search-row">
    <input
      type="text"
      class="search-input"
      placeholder="Search…"
      aria-label="Search pattern"
      bind:value={pattern}
      onkeydown={onKeyDown}
    />
    <button class="action-btn" onclick={() => void search()} disabled={searching}>
      {searching ? '…' : 'Search'}
    </button>
    <button class="close-btn" aria-label="Close search" onclick={onclose}>✕</button>
  </div>

  <div class="options-row">
    <label class="option">
      <input type="checkbox" bind:checked={caseSensitive} />
      Aa
    </label>
    <label class="option">
      <input type="checkbox" bind:checked={wholeWord} />
      <span class="whole-word-icon">W</span>
    </label>
    <label class="option">
      <input type="checkbox" bind:checked={useRegex} />
      .*
    </label>
  </div>

  <div class="replace-row">
    <input
      type="text"
      class="search-input"
      placeholder="Replace…"
      aria-label="Replacement text"
      bind:value={replacement}
    />
    <button
      class="action-btn"
      onclick={() => void replaceAll()}
      disabled={searching || results.length === 0}
    >
      Replace all
    </button>
  </div>

  {#if error !== null}
    <p class="error-msg">{error}</p>
  {/if}

  {#if results.length > 0}
    <div class="results" aria-label="Search results">
      <p class="results-summary">{resultsSummary}</p>
      {#each results as fileMatch (fileMatch.file)}
        <div class="file-group">
          <p class="file-name">{fileMatch.file}</p>
          {#each fileMatch.matches as match (match.matchStart)}
            <div class="match-row">
              <span class="line-num">{match.line}</span>
              <span class="line-text">{match.lineText}</span>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {:else if pattern.trim().length > 0 && !searching}
    <p class="no-results">No matches.</p>
  {/if}
</div>

<style>
  .search-panel {
    background: var(--surface-raised);
    border-top: var(--galley-border-thin) solid var(--border);
    padding: var(--galley-space-2) var(--galley-space-3);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    max-height: 40vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-1);
  }

  .search-row,
  .replace-row {
    display: flex;
    gap: var(--galley-space-2);
    align-items: center;
  }

  .search-input {
    flex: 1 1 auto;
    background: var(--bg-sunken);
    color: var(--fg);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-sm);
    padding: var(--galley-space-1) var(--galley-space-2);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
  }

  .action-btn {
    background: var(--bg-sunken);
    color: var(--fg);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-sm);
    padding: var(--galley-space-1) var(--galley-space-2);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    cursor: pointer;
    white-space: nowrap;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: var(--galley-text-md);
    padding: 0 var(--galley-space-1);
  }

  .options-row {
    display: flex;
    gap: var(--galley-space-3);
  }

  .option {
    display: flex;
    align-items: center;
    gap: var(--galley-space-1);
    cursor: pointer;
    color: var(--fg-muted);
    font-size: var(--galley-text-xs);
  }

  .whole-word-icon {
    text-decoration: underline;
    font-weight: bold;
  }

  .error-msg {
    margin: 0;
    color: var(--ribbon);
    font-size: var(--galley-text-xs);
  }

  .results {
    overflow-y: auto;
  }

  .results-summary {
    margin: 0 0 var(--galley-space-1);
    color: var(--fg-muted);
    font-size: var(--galley-text-xs);
  }

  .file-group {
    margin-bottom: var(--galley-space-2);
  }

  .file-name {
    margin: 0 0 var(--galley-space-1);
    color: var(--accent-text);
    font-size: var(--galley-text-xs);
    font-weight: bold;
  }

  .match-row {
    display: flex;
    gap: var(--galley-space-2);
    padding: 1px 0;
  }

  .line-num {
    color: var(--fg-faint);
    min-width: 3ch;
    text-align: right;
    flex-shrink: 0;
  }

  .line-text {
    color: var(--fg);
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .no-results {
    margin: 0;
    color: var(--fg-muted);
    font-size: var(--galley-text-xs);
  }
</style>
