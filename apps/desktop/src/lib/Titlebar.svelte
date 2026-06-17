<script lang="ts">
  import { Logo, Wordmark, IconButton, Icon } from '@galley/ui-kit';

  let {
    documentName,
    sidebarCollapsed,
    previewCollapsed,
    ontogglesidebar,
    ontogglepreview,
    onopensettings
  }: {
    documentName: string;
    sidebarCollapsed: boolean;
    previewCollapsed: boolean;
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

  <div class="doc" aria-live="polite">{documentName}</div>

  <div class="actions">
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

  .actions {
    display: flex;
    align-items: center;
    gap: var(--galley-space-1);
  }
</style>
