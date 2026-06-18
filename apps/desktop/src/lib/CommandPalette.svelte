<script lang="ts">
  import { filterActions, type PaletteAction } from './palette';

  let {
    actions,
    onclose
  }: {
    actions: PaletteAction[];
    onclose: () => void;
  } = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    inputEl?.focus();
  });

  const filtered = $derived(filterActions(query, actions));

  // Reset selection when the filtered list changes.
  $effect(() => {
    if (filtered.length > 0) {
      selectedIndex = 0;
    }
  });

  function execute(action: PaletteAction) {
    onclose();
    action.run();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[selectedIndex] !== undefined) {
        execute(filtered[selectedIndex]);
      }
    }
  }
</script>

<div class="overlay">
  <button class="scrim" aria-label="Close command palette" onclick={onclose}></button>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Command palette">
    <div class="search-wrap">
      <input
        type="text"
        class="palette-input"
        placeholder="Type a command…"
        aria-label="Command search"
        bind:value={query}
        bind:this={inputEl}
        onkeydown={onKeyDown}
      />
    </div>
    {#if filtered.length > 0}
      <ul class="list" role="listbox">
        {#each filtered as action, i (action.id)}
          <li role="option" aria-selected={i === selectedIndex}>
            <button
              type="button"
              class="item"
              class:selected={i === selectedIndex}
              onclick={() => execute(action)}
            >
              <span class="label">{action.label}</span>
              {#if action.shortcut !== undefined}
                <kbd class="shortcut">{action.shortcut}</kbd>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">No matching commands.</p>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--galley-z-overlay);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
  }

  .scrim {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    background: var(--overlay);
    cursor: default;
  }

  .dialog {
    position: relative;
    width: min(560px, 92vw);
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    background: var(--surface-raised);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-lg);
    box-shadow: var(--shadow-raised);
    overflow: hidden;
  }

  .search-wrap {
    padding: var(--galley-space-3);
    border-bottom: var(--galley-border-thin) solid var(--border);
  }

  .palette-input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-md);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: var(--galley-space-1) 0;
    overflow-y: auto;
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--galley-space-2) var(--galley-space-3);
    cursor: pointer;
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    color: var(--fg);
  }

  .item:hover,
  .item.selected {
    background: var(--bg-sunken);
  }

  .label {
    flex: 1 1 auto;
  }

  .shortcut {
    flex-shrink: 0;
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
    background: transparent;
    border: none;
    padding: 0;
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-3);
    color: var(--fg-muted);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
  }
</style>
