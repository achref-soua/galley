<script lang="ts">
  import { Button } from '@galley/ui-kit';

  let {
    onbold,
    onitalic,
    onpromote,
    ondemote
  }: {
    onbold: () => void;
    onitalic: () => void;
    onpromote: () => void;
    ondemote: () => void;
  } = $props();
</script>

<div class="format-bar" role="toolbar" aria-label="Text formatting">
  <Button variant="ghost" size="sm" title="Bold (⌘/Ctrl+B)" onclick={onbold}>
    <strong>B</strong>
  </Button>
  <Button variant="ghost" size="sm" title="Italic (⌘/Ctrl+I)" onclick={onitalic}>
    <em>I</em>
  </Button>
  <div class="separator" aria-hidden="true"></div>
  <Button variant="ghost" size="sm" title="Promote heading (Shift+Tab)" onclick={onpromote}>
    ↑H
  </Button>
  <Button variant="ghost" size="sm" title="Demote heading (Tab)" onclick={ondemote}>
    ↓H
  </Button>
</div>

<style>
  .format-bar {
    display: flex;
    align-items: center;
    gap: var(--galley-space-1);
    padding: var(--galley-space-1) var(--galley-space-3);
    background: var(--surface);
    border-bottom: var(--galley-border-thin) solid var(--border);
  }

  .separator {
    width: 1px;
    height: 1.25em;
    background: var(--border);
    margin: 0 var(--galley-space-1);
  }
</style>
