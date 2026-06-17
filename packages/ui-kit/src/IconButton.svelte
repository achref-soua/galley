<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    pressed,
    disabled = false,
    title,
    onclick,
    children
  }: {
    /** Accessible name (required — the button has no visible text). */
    label: string;
    /** Toggle state. Omit for a plain action button. */
    pressed?: boolean;
    disabled?: boolean;
    title?: string;
    onclick?: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  class="icon-btn"
  class:pressed
  aria-label={label}
  aria-pressed={pressed}
  title={title ?? label}
  {disabled}
  {onclick}
>
  {@render children()}
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: var(--galley-border-thin) solid transparent;
    border-radius: var(--galley-radius-md);
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition:
      background var(--galley-dur-fast) var(--galley-ease-mech),
      color var(--galley-dur-fast) var(--galley-ease-mech);
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--bg-sunken);
    color: var(--fg);
  }

  .icon-btn.pressed {
    color: var(--accent-text);
    border-color: var(--border);
    background: var(--bg-sunken);
  }

  .icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
