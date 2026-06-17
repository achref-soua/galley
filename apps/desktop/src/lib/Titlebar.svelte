<script lang="ts">
  import { Logo, Wordmark, IconButton, Icon } from '@galley/ui-kit';

  let {
    documentName,
    dirty,
    canSave,
    sidebarCollapsed,
    previewCollapsed,
    onsave,
    ontogglesidebar,
    ontogglepreview,
    onopensettings
  }: {
    documentName: string;
    dirty: boolean;
    canSave: boolean;
    sidebarCollapsed: boolean;
    previewCollapsed: boolean;
    onsave: () => void;
    ontogglesidebar: () => void;
    ontogglepreview: () => void;
    onopensettings: () => void;
  } = $props();
</script>

<header class="titlebar">
  <div class="brand">
    <Logo size={22} title="" />
    <Wordmark />
  </div>

  <div class="doc" aria-live="polite">
    {documentName}{#if dirty}<span class="dot" aria-label="unsaved changes">•</span>{/if}
  </div>

  <div class="actions">
    <IconButton label="Save" title="Save (⌘/Ctrl+S)" disabled={!canSave} onclick={onsave}>
      <Icon name="save" />
    </IconButton>
    <IconButton
      label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      pressed={!sidebarCollapsed}
      onclick={ontogglesidebar}
    >
      <Icon name="panel-left" />
    </IconButton>
    <IconButton
      label={previewCollapsed ? 'Show preview' : 'Hide preview'}
      pressed={!previewCollapsed}
      onclick={ontogglepreview}
    >
      <Icon name="panel-right" />
    </IconButton>
    <IconButton label="Settings" onclick={onopensettings}>
      <Icon name="settings" />
    </IconButton>
  </div>
</header>

<style>
  .titlebar {
    display: flex;
    align-items: center;
    gap: var(--galley-space-4);
    height: var(--galley-titlebar-height);
    padding: 0 var(--galley-space-3);
    background: var(--surface);
    border-bottom: var(--galley-border-thin) solid var(--border);
    user-select: none;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
    font-size: var(--galley-text-md);
  }

  .doc {
    flex: 1 1 auto;
    text-align: center;
    font-size: var(--galley-text-sm);
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot {
    margin-left: var(--galley-space-1);
    color: var(--accent);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--galley-space-1);
  }
</style>
