<script lang="ts">
  import { Panel } from '@galley/ui-kit';
</script>

<Panel title="Project">
  <nav class="tree" aria-label="Project files">
    <p class="empty">No project open yet.</p>
    <p class="hint">Open a folder to set type — that arrives in the next release.</p>
  </nav>
</Panel>

<style>
  .tree {
    padding: var(--galley-space-3);
  }

  .empty {
    margin: 0;
    color: var(--fg);
    font-size: var(--galley-text-sm);
  }

  .hint {
    margin: var(--galley-space-2) 0 0;
    color: var(--fg-faint);
    font-size: var(--galley-text-xs);
    line-height: var(--galley-leading-normal);
  }
</style>
