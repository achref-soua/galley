<script lang="ts">
  import { type AssetBackend } from './asset-backend';
  import { isImageExt, assetSnippet } from './assets';

  let {
    root,
    backend,
    oninsert
  }: {
    /** Absolute project root, or `null` when no project is open. */
    root: string | null;
    /** Asset backend (Tauri or in-memory). */
    backend: AssetBackend;
    /** Called with the LaTeX snippet when the user picks or clicks an asset. */
    oninsert: (snippet: string) => void;
  } = $props();

  let assets = $state<string[]>([]);
  let isOpen = $state(true);
  let pickInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (root === null) {
      assets = [];
    } else {
      void backend.listAssets(root).then((list) => {
        assets = list;
      });
    }
  });

  async function handlePick(event: Event) {
    const input = event.target as HTMLInputElement;
    if (root === null || input.files === null || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const rel = await backend.copyAsset(root, bytes, file.name);
    assets = await backend.listAssets(root);
    oninsert(assetSnippet(rel));
    input.value = '';
  }

  function openPicker() {
    pickInput?.click();
  }

  function basename(rel: string): string {
    return rel.slice(rel.lastIndexOf('/') + 1);
  }
</script>

<section class="asset-panel" aria-label="Assets">
  <div class="header">
    <button
      class="toggle"
      onclick={() => {
        isOpen = !isOpen;
      }}
      aria-expanded={isOpen}
    >
      Assets
    </button>
    {#if isOpen}
      <button class="add-btn" onclick={openPicker} aria-label="Add image">+</button>
    {/if}
  </div>

  <input
    bind:this={pickInput}
    type="file"
    accept="image/*,.pdf,.eps"
    class="hidden-input"
    onchange={handlePick}
  />

  {#if isOpen}
    {#if assets.length === 0}
      <p class="empty">No assets yet.</p>
    {:else}
      <ul class="asset-list" aria-label="Asset files">
        {#each assets as rel (rel)}
          <li>
            <button class="asset-item" onclick={() => oninsert(assetSnippet(rel))}>
              {#if isImageExt(rel)}
                <span class="img-tag" aria-hidden="true">img</span>
              {/if}
              <span class="name">{basename(rel)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .asset-panel {
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

  .add-btn {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    font-size: var(--galley-text-base);
    line-height: 1;
    cursor: pointer;
    padding: 0 var(--galley-space-1);
  }

  .add-btn:hover {
    color: var(--accent);
  }

  .hidden-input {
    display: none;
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-2) var(--galley-space-3);
    color: var(--fg-faint);
    font-size: var(--galley-text-xs);
  }

  .asset-list {
    list-style: none;
    margin: 0;
    padding: var(--galley-space-1) 0;
    overflow-y: auto;
    max-height: 180px;
  }

  .asset-item {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
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

  .asset-item:hover {
    background: var(--bg-sunken);
    color: var(--fg);
  }

  .img-tag {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 2px;
    padding: 0 2px;
    flex: none;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
