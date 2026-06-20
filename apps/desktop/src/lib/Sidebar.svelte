<script lang="ts">
  import { Panel, Button, Icon } from '@galley/ui-kit';
  import { type ProjectSnapshot } from './project-backend';
  import { type RecentProject } from './recent-projects';
  import { buildFileTree } from './file-tree';

  let {
    project,
    activePath,
    recent,
    onopenfile,
    onnewproject,
    onopenfolder,
    onopenrecent,
    onimport = undefined
  }: {
    project: ProjectSnapshot | null;
    activePath: string | null;
    recent: RecentProject[];
    onopenfile: (path: string) => void;
    onnewproject: (name: string) => void;
    onopenfolder: () => void;
    onopenrecent: (root: string) => void;
    /** Open the import wizard. Optional — omitted in tests / browser mode. */
    onimport?: () => void;
  } = $props();

  let newName = $state('');

  const tree = $derived(
    project === null ? [] : buildFileTree(project.documents.map((doc) => doc.path))
  );

  function indent(depth: number): string {
    return `padding-left: ${depth * 14 + 12}px`;
  }

  function submitNew(event: SubmitEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (name === '') {
      return;
    }
    onnewproject(name);
    newName = '';
  }
</script>

<Panel title={project === null ? 'Project' : project.name}>
  <div class="sidebar">
    {#if project === null}
      <p class="empty">No project open yet.</p>
    {:else}
      <ul class="tree" aria-label="Project files">
        {#each tree as node (node.path)}
          <li>
            {#if node.isDir}
              <span class="node dir" style={indent(node.depth)}>
                <Icon name="folder" size={15} />
                <span class="name">{node.name}</span>
              </span>
            {:else}
              <button
                class="node file"
                class:active={node.path === activePath}
                style={indent(node.depth)}
                aria-current={node.path === activePath}
                onclick={() => onopenfile(node.path)}
              >
                <Icon name="file" size={15} />
                <span class="name">{node.name}</span>
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="actions">
      <form class="new" onsubmit={submitNew}>
        <input
          class="name-input"
          type="text"
          placeholder="New project name"
          aria-label="New project name"
          bind:value={newName}
        />
        <Button type="submit" variant="primary" size="sm">Create</Button>
      </form>
      <Button size="sm" onclick={onopenfolder}>Open a folder…</Button>
      {#if onimport}
        <Button size="sm" onclick={onimport}>Import…</Button>
      {/if}
    </div>

    {#if recent.length > 0}
      <div class="recent">
        <h3>Recent</h3>
        <ul aria-label="Recent projects">
          {#each recent as item (item.root)}
            <li>
              <button class="recent-item" title={item.root} onclick={() => onopenrecent(item.root)}>
                {item.name}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</Panel>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-3);
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
  }

  .tree {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    list-style: none;
    margin: 0;
    padding: var(--galley-space-2) 0;
  }

  .node {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
    width: 100%;
    padding-top: 3px;
    padding-bottom: 3px;
    padding-right: var(--galley-space-3);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    color: var(--fg-muted);
    text-align: left;
  }

  .dir {
    color: var(--fg);
    font-weight: var(--galley-weight-bold);
  }

  button.file {
    border: none;
    background: transparent;
    cursor: pointer;
  }

  button.file:hover {
    background: var(--bg-sunken);
    color: var(--fg);
  }

  button.file.active {
    color: var(--fg);
    background: var(--bg-sunken);
    box-shadow: inset 2px 0 0 var(--accent);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-2);
    padding: var(--galley-space-3);
    border-top: var(--galley-border-thin) solid var(--border);
  }

  .new {
    display: flex;
    gap: var(--galley-space-2);
  }

  .name-input {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--bg-sunken);
    color: var(--fg);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-md);
    padding: var(--galley-space-1) var(--galley-space-2);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
  }

  .recent {
    padding: 0 var(--galley-space-3) var(--galley-space-3);
  }

  .recent h3 {
    margin: 0 0 var(--galley-space-2);
    font-size: var(--galley-text-xs);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
    color: var(--fg-muted);
  }

  .recent ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .recent-item {
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    padding: var(--galley-space-1) var(--galley-space-2);
    border-radius: var(--galley-radius-md);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-item:hover {
    background: var(--bg-sunken);
    color: var(--fg);
  }
</style>
