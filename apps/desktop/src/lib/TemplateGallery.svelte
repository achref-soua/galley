<script lang="ts">
  import { Button } from '@galley/ui-kit';
  import {
    BUILT_IN_TEMPLATES,
    TEMPLATE_CATEGORIES,
    filterTemplates,
    type TemplateCategory,
    type TemplateDefinition,
    type CustomTemplateStore
  } from './templates';

  let {
    customStore,
    currentContent = null,
    onuse,
    onclose
  }: {
    /** Store holding user-saved templates. */
    customStore: CustomTemplateStore;
    /** The currently open document's content, or `null` when none is open. */
    currentContent: string | null;
    /** Called when the user selects a template to use. */
    onuse: (template: TemplateDefinition) => void;
    /** Called when the user closes the gallery without selecting. */
    onclose: () => void;
  } = $props();

  let selectedCategory = $state<TemplateCategory | null>(null);
  let query = $state('');
  let saving = $state(false);
  let saveName = $state('');
  let saveCategory = $state<TemplateCategory>('Custom');

  // Force re-evaluation of custom templates when the store mutates.
  let generation = $state(0);
  function invalidate() {
    generation += 1;
  }

  const customTemplates = $derived(
    (() => {
      void generation;
      return customStore.all();
    })()
  );

  const allTemplates = $derived([...BUILT_IN_TEMPLATES, ...customTemplates]);
  const filtered = $derived(filterTemplates(allTemplates, selectedCategory, query));

  function handleCategorySelect(cat: TemplateCategory | null) {
    selectedCategory = cat === selectedCategory ? null : cat;
  }

  function handleUse(template: TemplateDefinition) {
    onuse(template);
  }

  function handleSaveStart() {
    saving = true;
    saveName = '';
    saveCategory = 'Custom';
  }

  function handleSaveCancel() {
    saving = false;
    saveName = '';
  }

  function handleSaveConfirm() {
    const name = saveName.trim();
    if (name === '' || currentContent === null) {
      saving = false;
      return;
    }
    customStore.add({
      id: 'custom-' + String(Date.now()),
      name,
      category: saveCategory,
      description: 'Custom template.',
      body: currentContent
    });
    invalidate();
    saving = false;
    saveName = '';
  }

  function handleDeleteCustom(id: string) {
    customStore.remove(id);
    invalidate();
  }

  function handleSaveKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSaveConfirm();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleSaveCancel();
    }
  }
</script>

<div class="gallery" role="dialog" aria-label="Template gallery" aria-modal="true">
  <header class="gallery-header">
    <h2 class="gallery-title">Template Gallery</h2>
    <Button variant="ghost" size="sm" onclick={onclose} aria-label="Close">✕ Close</Button>
  </header>

  <div class="gallery-body">
    <nav class="gallery-sidebar" aria-label="Template categories">
      <button
        class="cat-btn"
        class:active={selectedCategory === null}
        aria-pressed={selectedCategory === null}
        onclick={() => handleCategorySelect(null)}
      >
        All templates
      </button>
      {#each TEMPLATE_CATEGORIES as cat (cat)}
        <button
          class="cat-btn"
          class:active={selectedCategory === cat}
          aria-pressed={selectedCategory === cat}
          onclick={() => handleCategorySelect(cat)}
        >
          {cat}
        </button>
      {/each}
    </nav>

    <div class="gallery-main">
      <div class="search-row">
        <input
          class="search-input"
          type="search"
          placeholder="Search templates…"
          aria-label="Search templates"
          bind:value={query}
        />
      </div>

      {#if filtered.length === 0}
        <p class="empty">No templates match your search.</p>
      {:else}
        <ul class="template-grid" aria-label="Templates">
          {#each filtered as template (template.id)}
            <li class="template-card">
              <div class="card-top">
                <div class="card-name">{template.name}</div>
                <span class="card-category">{template.category}</span>
              </div>
              <p class="card-desc">{template.description}</p>
              <div class="card-actions">
                <Button
                  variant="primary"
                  size="sm"
                  onclick={() => handleUse(template)}
                  aria-label={'Use ' + template.name}
                >
                  Use template
                </Button>
                {#if template.category === 'Custom'}
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => handleDeleteCustom(template.id)}
                    aria-label={'Delete ' + template.name}
                  >
                    Delete
                  </Button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <footer class="gallery-footer">
    {#if saving}
      <div class="save-form" role="form" aria-label="Save as template">
        <input
          class="save-input"
          type="text"
          placeholder="Template name…"
          aria-label="Template name"
          bind:value={saveName}
          onkeydown={handleSaveKeydown}
        />
        <select class="save-category" aria-label="Template category" bind:value={saveCategory}>
          {#each TEMPLATE_CATEGORIES as cat}
            <option value={'' + cat}>{'' + cat}</option>
          {/each}
        </select>
        <Button variant="primary" size="sm" onclick={handleSaveConfirm}>Save</Button>
        <Button variant="ghost" size="sm" onclick={handleSaveCancel}>Cancel</Button>
      </div>
    {:else if currentContent !== null}
      <Button variant="ghost" size="sm" onclick={handleSaveStart}>
        Save current document as template…
      </Button>
    {/if}
  </footer>
</div>

<style>
  .gallery {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    border-radius: var(--galley-radius-md);
  }

  .gallery-header {
    display: flex;
    align-items: center;
    gap: var(--galley-space-4);
    padding: var(--galley-space-5) var(--galley-space-6);
    border-bottom: var(--galley-border-thin) solid var(--border);
    flex: none;
  }

  .gallery-title {
    margin: 0;
    flex: 1 1 auto;
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-lg);
    color: var(--fg);
  }

  .gallery-body {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .gallery-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-1);
    width: 160px;
    flex: none;
    padding: var(--galley-space-4) var(--galley-space-3);
    border-right: var(--galley-border-thin) solid var(--border);
    overflow-y: auto;
  }

  .cat-btn {
    background: transparent;
    border: none;
    border-radius: var(--galley-radius-sm);
    color: var(--fg-muted);
    cursor: pointer;
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    padding: var(--galley-space-2) var(--galley-space-3);
    text-align: left;
    transition: background 0.1s;
  }

  .cat-btn:hover {
    background: var(--bg-sunken);
    color: var(--fg);
  }

  .cat-btn.active {
    background: var(--accent);
    color: var(--bg);
  }

  .gallery-main {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    padding: var(--galley-space-4);
    gap: var(--galley-space-4);
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

  .empty {
    margin: 0;
    padding: var(--galley-space-8) 0;
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
    text-align: center;
  }

  .template-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--galley-space-4);
    overflow-y: auto;
    flex: 1 1 auto;
    min-height: 0;
    align-content: start;
  }

  .template-card {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-3);
    padding: var(--galley-space-4);
    background: var(--surface);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-md);
  }

  .card-top {
    display: flex;
    align-items: baseline;
    gap: var(--galley-space-2);
    flex-wrap: wrap;
  }

  .card-name {
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-md);
    font-weight: var(--galley-weight-bold);
    color: var(--fg);
    flex: 1 1 auto;
  }

  .card-category {
    font-size: var(--galley-text-xs);
    color: var(--fg-faint);
    font-family: var(--galley-font-mono);
    flex: none;
  }

  .card-desc {
    margin: 0;
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
    line-height: 1.5;
    flex: 1 1 auto;
  }

  .card-actions {
    display: flex;
    gap: var(--galley-space-2);
    flex: none;
  }

  .gallery-footer {
    flex: none;
    border-top: var(--galley-border-thin) solid var(--border);
    padding: var(--galley-space-3) var(--galley-space-6);
    display: flex;
    align-items: center;
  }

  .save-form {
    display: flex;
    align-items: center;
    gap: var(--galley-space-3);
    width: 100%;
  }

  .save-input {
    flex: 1 1 auto;
    background: var(--bg-sunken);
    color: var(--fg);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-sm);
    padding: var(--galley-space-2) var(--galley-space-3);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
  }

  .save-category {
    background: var(--bg-sunken);
    color: var(--fg);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-sm);
    padding: var(--galley-space-2) var(--galley-space-2);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    flex: none;
  }
</style>
