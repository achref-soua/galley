<script lang="ts">
  interface Option {
    value: string;
    label: string;
  }

  let {
    options,
    value,
    ariaLabel,
    onchange
  }: {
    options: Option[];
    value: string;
    /** Accessible name for the group. */
    ariaLabel: string;
    onchange?: (value: string) => void;
  } = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={ariaLabel}>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      class="segment"
      class:active={option.value === value}
      aria-checked={option.value === value}
      onclick={() => onchange?.(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    padding: 2px;
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-md);
    background: var(--bg-sunken);
  }

  .segment {
    border: none;
    border-radius: var(--galley-radius-sm);
    background: transparent;
    color: var(--fg-muted);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    padding: var(--galley-space-1) var(--galley-space-3);
    cursor: pointer;
    transition:
      background var(--galley-dur-fast) var(--galley-ease-mech),
      color var(--galley-dur-fast) var(--galley-ease-mech);
  }

  .segment:hover {
    color: var(--fg);
  }

  .segment.active {
    background: var(--surface-raised);
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--border);
  }
</style>
