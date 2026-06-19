<script lang="ts">
  import { type CiteCandidate } from './bibliography';
  import { type LookupKind } from './bib-backend';

  let {
    candidates,
    oninsert,
    onlookup,
    onimport
  }: {
    /** The project's citation candidates (key + summary). */
    candidates: CiteCandidate[];
    /** Called with a `\cite{…}` command when an entry is clicked. */
    oninsert: (cite: string) => void;
    /** Resolve a DOI/arXiv id and add it; resolves to the new key, or `null`. */
    onlookup: (query: string, kind: LookupKind) => Promise<string | null>;
    /** Merge a `.bib` export's entries; resolves to the number added. */
    onimport: (content: string) => Promise<number>;
  } = $props();

  let isOpen = $state(true);
  let query = $state('');
  let kind = $state<LookupKind>('doi');
  let status = $state('');
  let busy = $state(false);
  let pickInput = $state<HTMLInputElement | null>(null);

  function citeCommand(key: string): string {
    return `\\cite{${key}}`;
  }

  async function lookup() {
    const trimmed = query.trim();
    if (trimmed === '' || busy) {
      return;
    }
    busy = true;
    status = 'Looking up…';
    const key = await onlookup(trimmed, kind);
    busy = false;
    if (key === null) {
      status = 'Could not add that reference.';
    } else {
      status = `Added ${key}`;
      query = '';
    }
  }

  function openPicker() {
    pickInput?.click();
  }

  async function handlePick(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files === null || input.files.length === 0) {
      return;
    }
    const content = await input.files[0].text();
    input.value = '';
    const added = await onimport(content);
    status =
      added === 0
        ? 'No new entries to import.'
        : `Imported ${added} entr${added === 1 ? 'y' : 'ies'}.`;
  }
</script>

<section class="bib-panel" aria-label="References">
  <div class="header">
    <button
      class="toggle"
      onclick={() => {
        isOpen = !isOpen;
      }}
      aria-expanded={isOpen}
    >
      References
    </button>
    {#if isOpen}
      <button class="import-btn" onclick={openPicker} aria-label="Import .bib file">Import</button>
    {/if}
  </div>

  <input
    bind:this={pickInput}
    type="file"
    accept=".bib"
    class="hidden-input"
    onchange={handlePick}
  />

  {#if isOpen}
    <form
      class="lookup"
      onsubmit={(e) => {
        e.preventDefault();
        void lookup();
      }}
    >
      <input
        type="search"
        class="query"
        placeholder="DOI or arXiv id"
        aria-label="DOI or arXiv id"
        bind:value={query}
      />
      <div class="kind" role="radiogroup" aria-label="Reference kind">
        <label><input type="radio" name="bib-kind" value="doi" bind:group={kind} /> DOI</label>
        <label><input type="radio" name="bib-kind" value="arxiv" bind:group={kind} /> arXiv</label>
      </div>
      <button type="submit" class="add-btn" disabled={busy}>Add</button>
    </form>

    {#if status !== ''}
      <p class="status" role="status">{status}</p>
    {/if}

    {#if candidates.length === 0}
      <p class="empty">No references yet.</p>
    {:else}
      <ul class="cite-list" aria-label="Citation entries">
        {#each candidates as candidate (candidate.key)}
          <li>
            <button class="cite-item" onclick={() => oninsert(citeCommand(candidate.key))}>
              <span class="key">{candidate.key}</span>
              <span class="summary">{candidate.summary}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .bib-panel {
    border-top: 1px solid var(--border);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--galley-space-2) var(--galley-space-3);
  }

  .toggle {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
    cursor: pointer;
    padding: 0;
  }

  .toggle:hover {
    color: var(--fg);
  }

  .import-btn {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    cursor: pointer;
    padding: 0;
  }

  .import-btn:hover {
    color: var(--accent);
  }

  .lookup {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-1);
    padding: 0 var(--galley-space-3) var(--galley-space-2);
  }

  .query {
    background: var(--bg-sunken);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: 3px;
    color: var(--fg);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    padding: 3px var(--galley-space-2);
  }

  .kind {
    display: flex;
    gap: var(--galley-space-3);
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
  }

  .add-btn {
    align-self: flex-start;
    background: transparent;
    border: var(--galley-border-thin) solid var(--border);
    border-radius: 3px;
    color: var(--fg-muted);
    font-size: var(--galley-text-xs);
    padding: 2px var(--galley-space-3);
    cursor: pointer;
  }

  .add-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .add-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .status {
    margin: 0;
    padding: 0 var(--galley-space-3) var(--galley-space-2);
    color: var(--fg-muted);
    font-size: var(--galley-text-xs);
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-2) var(--galley-space-3);
    color: var(--fg-faint);
    font-size: var(--galley-text-xs);
  }

  .cite-list {
    list-style: none;
    margin: 0;
    padding: var(--galley-space-1) 0;
    overflow-y: auto;
    max-height: 180px;
  }

  .cite-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 3px var(--galley-space-3);
    background: transparent;
    border: none;
    color: var(--fg-muted);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
  }

  .cite-item:hover {
    background: var(--bg-sunken);
    color: var(--fg);
  }

  .key {
    color: var(--accent);
  }

  .summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
