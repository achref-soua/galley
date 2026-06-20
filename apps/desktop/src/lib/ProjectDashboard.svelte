<script lang="ts">
  import { Button } from '@galley/ui-kit';
  import { type ProjectRegistry, searchProjects, allTags } from './project-registry';
  import type { WindowBackend } from './window-backend';

  let {
    registry,
    windowBackend,
    onopen,
    onopennewwindow,
    onnew,
    ontemplate,
    onimport
  }: {
    /** The project registry to read from and mutate tags/removal on. */
    registry: ProjectRegistry;
    /** Backend for opening a new window. */
    windowBackend: WindowBackend;
    /** Open the given project root in this window. */
    onopen: (root: string) => void;
    /** Open a new blank window. */
    onopennewwindow: () => void;
    /** Create a new project (pick parent + name). */
    onnew: () => void;
    /** Open the template gallery. */
    ontemplate: () => void;
    /** Open the import wizard. */
    onimport: () => void;
  } = $props();

  let search = $state('');
  let filterTag = $state<string | null>(null);
  let addingTagFor = $state<string | null>(null);
  let pendingTag = $state('');

  // Force a rerender counter when the registry mutates (tags added/removed,
  // projects removed). The registry is a plain class — Svelte can't observe it
  // automatically, so we use a generation counter to drive reactivity.
  let generation = $state(0);

  function invalidate() {
    generation += 1;
  }

  // Derive the filtered project list from the registry contents.
  // We read `generation` so the derived value re-evaluates on every mutation.
  const filtered = $derived(
    (() => {
      void generation;
      return searchProjects(registry.all(), search, filterTag !== null ? filterTag : undefined);
    })()
  );

  const knownTags = $derived(
    (() => {
      void generation;
      return allTags(registry.all());
    })()
  );

  function handleOpen(root: string) {
    onopen(root);
  }

  function handleNewWindow() {
    void windowBackend.openInNewWindow();
    onopennewwindow();
  }

  function handleRemove(root: string) {
    registry.remove(root);
    invalidate();
  }

  function handleSetFilterTag(tag: string | null) {
    filterTag = tag === filterTag ? null : tag;
  }

  function handleStartAddTag(root: string) {
    addingTagFor = root;
    pendingTag = '';
  }

  function handleCancelAddTag() {
    addingTagFor = null;
    pendingTag = '';
  }

  function handleConfirmAddTag(root: string) {
    const tag = pendingTag.trim();
    if (tag !== '') {
      registry.addTag(root, tag);
      invalidate();
    }
    addingTagFor = null;
    pendingTag = '';
  }

  function handleRemoveTag(root: string, tag: string) {
    registry.removeTag(root, tag);
    invalidate();
  }

  function tagInputKeydown(event: KeyboardEvent, root: string) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleConfirmAddTag(root);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelAddTag();
    }
  }

  function formatDate(ts: number | null): string {
    if (ts === null) {
      return 'Never opened';
    }
    return new Date(ts).toLocaleDateString();
  }

  function shortRoot(root: string): string {
    const parts = root.split(/[\\/]/);
    return parts.length <= 3 ? root : '…/' + parts.slice(parts.length - 2).join('/');
  }
</script>

<div class="dashboard" role="region" aria-label="Project dashboard">
  <header class="dash-header">
    <h2 class="dash-title">All Projects</h2>
    <div class="dash-actions">
      <Button variant="primary" size="sm" onclick={onnew}>New project…</Button>
      <Button variant="ghost" size="sm" onclick={ontemplate}>From template…</Button>
      <Button variant="ghost" size="sm" onclick={onimport}>Import…</Button>
      <Button variant="ghost" size="sm" onclick={handleNewWindow}>New window</Button>
    </div>
  </header>

  <div class="search-row">
    <input
      class="search-input"
      type="search"
      placeholder="Search projects…"
      aria-label="Search projects"
      bind:value={search}
    />
  </div>

  {#if knownTags.length > 0}
    <div class="tag-filters" aria-label="Filter by tag">
      <span class="tag-filters-label">Tags:</span>
      {#each knownTags as tag (tag)}
        <button
          class="tag-chip"
          class:active={filterTag === tag}
          aria-pressed={filterTag === tag}
          onclick={() => handleSetFilterTag(tag)}
        >
          {tag}
        </button>
      {/each}
      {#if filterTag !== null}
        <button
          class="tag-clear"
          aria-label="Clear tag filter"
          onclick={() => handleSetFilterTag(null)}
        >
          ✕
        </button>
      {/if}
    </div>
  {/if}

  {#if filtered.length === 0}
    <p class="empty">
      {search !== '' || filterTag !== null
        ? 'No projects match your search.'
        : 'No projects yet. Create or import one to get started.'}
    </p>
  {:else}
    <ul class="project-grid" aria-label="Projects">
      {#each filtered as project (project.root)}
        <li class="project-card">
          <div class="card-main">
            <div class="card-name">{project.name}</div>
            <div class="card-meta">
              <span class="card-date" title={'Last opened: ' + formatDate(project.lastOpened)}>
                {formatDate(project.lastOpened)}
              </span>
              <span class="card-root" title={project.root}>{shortRoot(project.root)}</span>
            </div>
            <div class="card-tags">
              {#each project.tags as tag}
                <span class="tag-chip small">
                  {tag}
                  <button
                    class="tag-remove"
                    aria-label={'Remove tag ' + tag}
                    onclick={() => handleRemoveTag(project.root, tag)}>✕</button
                  >
                </span>
              {/each}
              {#if addingTagFor === project.root}
                <input
                  class="tag-input"
                  type="text"
                  placeholder="Tag name"
                  aria-label="New tag name"
                  bind:value={pendingTag}
                  onkeydown={(e) => tagInputKeydown(e, project.root)}
                />
                <button
                  class="tag-confirm"
                  aria-label="Confirm tag"
                  onclick={() => handleConfirmAddTag(project.root)}>✓</button
                >
                <button class="tag-cancel" aria-label="Cancel tag" onclick={handleCancelAddTag}
                  >✕</button
                >
              {:else}
                <button
                  class="tag-add"
                  aria-label={'Add tag to ' + project.name}
                  onclick={() => handleStartAddTag(project.root)}>+</button
                >
              {/if}
            </div>
          </div>
          <div class="card-controls">
            <Button variant="primary" size="sm" onclick={() => handleOpen(project.root)}>
              Open
            </Button>
            <Button variant="ghost" size="sm" onclick={() => handleRemove(project.root)}>
              Remove
            </Button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    padding: var(--galley-space-6) var(--galley-space-8);
    gap: var(--galley-space-4);
  }

  .dash-header {
    display: flex;
    align-items: center;
    gap: var(--galley-space-4);
    flex: none;
  }

  .dash-title {
    margin: 0;
    flex: 1 1 auto;
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-lg);
    color: var(--fg);
  }

  .dash-actions {
    display: flex;
    gap: var(--galley-space-2);
    flex: none;
  }

  .search-row {
    flex: none;
  }

  .search-input {
    width: 100%;
    background: var(--bg-sunken);
    color: var(--fg);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-md);
    padding: var(--galley-space-2) var(--galley-space-3);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    box-sizing: border-box;
  }

  .search-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }

  .tag-filters {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
    flex-wrap: wrap;
    flex: none;
  }

  .tag-filters-label {
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
    flex: none;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px var(--galley-space-2);
    border-radius: 999px;
    border: var(--galley-border-thin) solid var(--border);
    background: var(--bg-sunken);
    color: var(--fg-muted);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    cursor: pointer;
  }

  .tag-chip.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }

  .tag-chip.small {
    cursor: default;
  }

  .tag-clear {
    background: transparent;
    border: none;
    color: var(--fg-faint);
    cursor: pointer;
    font-size: var(--galley-text-xs);
    padding: 0 var(--galley-space-1);
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-8) 0;
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
    text-align: center;
  }

  .project-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--galley-space-4);
    overflow-y: auto;
    flex: 1 1 auto;
    min-height: 0;
    align-content: start;
  }

  .project-card {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-3);
    padding: var(--galley-space-4);
    background: var(--surface);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-md);
  }

  .card-main {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-2);
    flex: 1 1 auto;
  }

  .card-name {
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-md);
    color: var(--fg);
    font-weight: var(--galley-weight-bold);
  }

  .card-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-date {
    font-size: var(--galley-text-xs);
    color: var(--fg-faint);
  }

  .card-root {
    font-size: var(--galley-text-xs);
    color: var(--fg-faint);
    font-family: var(--galley-font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--galley-space-1);
    align-items: center;
    min-height: 24px;
  }

  .tag-remove {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0 2px;
    font-size: 10px;
    line-height: 1;
  }

  .tag-add {
    background: transparent;
    border: var(--galley-border-thin) dashed var(--border);
    border-radius: 999px;
    color: var(--fg-faint);
    cursor: pointer;
    font-size: var(--galley-text-xs);
    padding: 2px var(--galley-space-2);
    line-height: 1;
  }

  .tag-add:hover {
    color: var(--fg-muted);
    border-color: var(--fg-faint);
  }

  .tag-input {
    background: var(--bg-sunken);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-sm);
    color: var(--fg);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    padding: 1px var(--galley-space-1);
    width: 80px;
  }

  .tag-confirm,
  .tag-cancel {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--fg-muted);
    font-size: var(--galley-text-xs);
    padding: 0 2px;
  }

  .tag-confirm:hover {
    color: var(--sage);
  }

  .tag-cancel:hover {
    color: var(--ribbon);
  }

  .card-controls {
    display: flex;
    gap: var(--galley-space-2);
    flex: none;
  }
</style>
