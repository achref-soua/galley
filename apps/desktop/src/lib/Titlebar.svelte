<script lang="ts">
  import { Logo, Wordmark, IconButton, Icon, Button } from '@galley/ui-kit';

  let {
    documentName,
    dirty,
    canSave,
    canCompile,
    compiling,
    sidebarCollapsed,
    previewCollapsed,
    chatOpen = false,
    viewMode = 'code',
    oncompile,
    onsave,
    ontogglesidebar,
    ontogglepreview,
    onopensettings,
    onopenmatch,
    onopentable,
    ontogglechat = undefined,
    ontoggleviewmode = undefined,
    ondashboard = undefined
  }: {
    documentName: string;
    dirty: boolean;
    canSave: boolean;
    canCompile: boolean;
    compiling: boolean;
    sidebarCollapsed: boolean;
    previewCollapsed: boolean;
    chatOpen?: boolean;
    viewMode?: 'code' | 'visual';
    oncompile: () => void;
    onsave: () => void;
    ontogglesidebar: () => void;
    ontogglepreview: () => void;
    onopensettings: () => void;
    onopenmatch: () => void;
    onopentable: () => void;
    ontogglechat?: () => void;
    ontoggleviewmode?: () => void;
    /** Open / close the project dashboard. */
    ondashboard?: () => void;
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
    <Button
      variant="primary"
      size="sm"
      title="Compile (⌘/Ctrl+B)"
      disabled={!canCompile || compiling}
      onclick={oncompile}
    >
      <Icon name="compile" />
      {compiling ? 'Compiling…' : 'Compile'}
    </Button>
    <Button
      variant="ghost"
      size="sm"
      title="Insert equation"
      disabled={!canCompile}
      onclick={onopenmatch}
    >
      ∑
    </Button>
    <Button
      variant="ghost"
      size="sm"
      title="Insert table"
      disabled={!canCompile}
      onclick={onopentable}
    >
      ⊞
    </Button>
    <Button
      variant="ghost"
      size="sm"
      title={viewMode === 'visual' ? 'Switch to code view' : 'Switch to visual view'}
      disabled={!canCompile}
      onclick={ontoggleviewmode}
      aria-pressed={viewMode === 'visual'}
    >
      {viewMode === 'visual' ? '<>' : '¶'}
    </Button>
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
    <IconButton
      label={chatOpen ? 'Close assistant' : 'Open assistant'}
      pressed={chatOpen}
      onclick={ontogglechat}
    >
      <Icon name="chat" />
    </IconButton>
    <IconButton label="All projects" title="All projects" onclick={ondashboard}>
      <Icon name="folder" />
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
