<script lang="ts">
  import { Button } from '@galley/ui-kit';

  let {
    label,
    onsave,
    ondiscard,
    oncancel
  }: {
    label: string;
    onsave: () => void;
    ondiscard: () => void;
    oncancel: () => void;
  } = $props();

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="overlay">
  <button class="scrim" aria-label="Keep editing" onclick={oncancel}></button>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Unsaved changes">
    <h1>Unsaved changes</h1>
    <p>You have unsaved edits. {label} anyway?</p>
    <div class="actions">
      <Button variant="primary" onclick={onsave}>Save &amp; continue</Button>
      <Button onclick={ondiscard}>Discard</Button>
      <Button variant="ghost" onclick={oncancel}>Cancel</Button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--galley-z-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
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
    width: min(420px, 92vw);
    padding: var(--galley-space-5);
    background: var(--surface-raised);
    color: var(--fg);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-lg);
    box-shadow: var(--shadow-raised);
  }

  .dialog h1 {
    margin: 0 0 var(--galley-space-2);
    font-size: var(--galley-text-lg);
    letter-spacing: var(--galley-tracking-wide);
  }

  .dialog p {
    margin: 0 0 var(--galley-space-4);
    color: var(--fg-muted);
    font-size: var(--galley-text-sm);
    line-height: var(--galley-leading-normal);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--galley-space-2);
  }
</style>
