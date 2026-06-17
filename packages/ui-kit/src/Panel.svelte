<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    actions,
    children
  }: {
    /** Optional panel heading. */
    title?: string;
    /** Optional header-aligned actions (buttons, toggles). */
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="panel">
  {#if title || actions}
    <header class="panel-head">
      {#if title}<h2 class="panel-title">{title}</h2>{/if}
      {#if actions}<div class="panel-actions">{@render actions()}</div>{/if}
    </header>
  {/if}
  <div class="panel-body">{@render children()}</div>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: var(--surface);
    color: var(--fg);
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--galley-space-2);
    padding: var(--galley-space-2) var(--galley-space-3);
    border-bottom: var(--galley-border-thin) solid var(--border);
  }

  .panel-title {
    margin: 0;
    font-size: var(--galley-text-xs);
    font-weight: var(--galley-weight-bold);
    letter-spacing: var(--galley-tracking-caps);
    text-transform: uppercase;
    color: var(--fg-muted);
  }

  .panel-actions {
    display: flex;
    align-items: center;
    gap: var(--galley-space-1);
  }

  .panel-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
</style>
