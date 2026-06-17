<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'default',
    size = 'md',
    type = 'button',
    disabled = false,
    title,
    onclick,
    children
  }: {
    variant?: 'primary' | 'default' | 'ghost';
    size?: 'sm' | 'md';
    type?: 'button' | 'submit';
    disabled?: boolean;
    title?: string;
    onclick?: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  class="btn"
  class:primary={variant === 'primary'}
  class:ghost={variant === 'ghost'}
  class:sm={size === 'sm'}
  {type}
  {disabled}
  {title}
  {onclick}
>
  {@render children()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--galley-space-2);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-md);
    background: var(--surface-raised);
    color: var(--fg);
    font-family: var(--galley-font-mono);
    font-weight: var(--galley-weight-bold);
    letter-spacing: var(--galley-tracking-wide);
    cursor: pointer;
    padding: var(--galley-space-2) var(--galley-space-4);
    font-size: var(--galley-text-sm);
    transition:
      background var(--galley-dur-fast) var(--galley-ease-mech),
      transform var(--galley-dur-fast) var(--galley-ease-mech);
  }

  .btn.sm {
    padding: var(--galley-space-1) var(--galley-space-3);
    font-size: var(--galley-text-xs);
  }

  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-fg);
  }

  .btn.ghost {
    background: transparent;
    border-color: transparent;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-sunken);
  }

  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
