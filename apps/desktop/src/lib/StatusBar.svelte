<script lang="ts">
  import { countWords, formatCount } from './count';

  let { content }: { content: string } = $props();

  const countLabel = $derived(formatCount(countWords(content)));
</script>

<div class="status-bar" aria-label="Document statistics">
  <span class="count">{countLabel}</span>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    padding: 0 var(--galley-space-3);
    height: 1.6rem;
    background: var(--bg-sunken);
    border-top: var(--galley-border-thin) solid var(--border);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
    flex-shrink: 0;
  }

  .count {
    margin-left: auto;
  }
</style>
