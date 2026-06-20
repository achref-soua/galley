<script lang="ts">
  import { Panel, Button } from '@galley/ui-kit';
  import { computeDiff, type DiffLine, type SnapshotEntry } from './vcs';

  let {
    root,
    content,
    entries,
    selectedId,
    selectedContent,
    onselect,
    onrevert,
    oncreatesnapshot
  }: {
    /** Absolute project root, or null when no project is open. */
    root: string | null;
    /** Current document content (for diffing against a selected entry). */
    content: string;
    /** Checkpoint timeline, most-recent first. */
    entries: SnapshotEntry[];
    /** Currently selected checkpoint id, or null. */
    selectedId: string | null;
    /** Content of the selected checkpoint, or null while loading. */
    selectedContent: string | null;
    /** Called when the user selects a checkpoint entry. */
    onselect: (id: string) => void;
    /** Called when the user clicks Revert; argument is the restored content. */
    onrevert: (restored: string) => void;
    /** Called when the user saves a named snapshot. */
    oncreatesnapshot: (name: string) => void;
  } = $props();

  let snapshotName = $state('');

  // Only show added/removed lines — context is too verbose for a compact panel.
  const changedLines = $derived(
    selectedContent !== null
      ? computeDiff(selectedContent, content).filter((d) => d.kind !== 'context')
      : ([] as DiffLine[])
  );

  function revert() {
    if (selectedContent !== null) {
      onrevert(selectedContent);
    }
  }

  function submitSnapshot(event: SubmitEvent) {
    event.preventDefault();
    const name = snapshotName.trim();
    if (name === '') {
      return;
    }
    oncreatesnapshot(name);
    snapshotName = '';
  }

  function kindClass(kind: DiffLine['kind']): string {
    return kind === 'added' ? 'diff-added' : 'diff-removed';
  }

  function kindPrefix(kind: DiffLine['kind']): string {
    return kind === 'added' ? '+' : '-';
  }
</script>

<Panel title="History">
  <div class="history-panel">
    {#if root === null}
      <p class="empty">Open a project to see its history.</p>
    {:else if entries.length === 0}
      <p class="empty">No checkpoints yet — save the document to create one.</p>
    {:else}
      <ul class="timeline" aria-label="Version history">
        {#each entries as entry (entry.id)}
          <li>
            <button
              class="entry"
              class:selected={selectedId === entry.id}
              onclick={() => onselect(entry.id)}
              aria-current={selectedId === entry.id}
            >
              <span class="entry-name">{entry.name}</span>
              <span class="entry-meta">
                {entry.date.slice(0, 10)}
                {#if entry.linesAdded > 0 || entry.linesRemoved > 0}
                  <span class="stats">
                    {#if entry.linesAdded > 0}
                      <span class="added">{'+' + entry.linesAdded}</span>
                    {/if}
                    {#if entry.linesRemoved > 0}
                      <span class="removed">{'−' + entry.linesRemoved}</span>
                    {/if}
                  </span>
                {/if}
                {#if entry.isNamed}
                  <span class="named-badge">named</span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>

      {#if selectedId !== null && selectedContent !== null}
        <div class="diff-section">
          <div class="diff-header">
            <span>Changes vs. current</span>
            <Button size="sm" variant="primary" onclick={revert}>Revert</Button>
          </div>
          <div class="diff-viewer" aria-label="Diff viewer">
            {#if changedLines.length === 0}
              <p class="diff-identical">Identical to current document.</p>
            {:else}
              {#each changedLines as line, i (i)}
                <div class={kindClass(line.kind)}>
                  <span class="gutter">{kindPrefix(line.kind)}</span>
                  <span class="line-text">{line.text}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    {/if}

    {#if root !== null}
      <div class="snapshot-form">
        <form onsubmit={submitSnapshot}>
          <input
            class="name-input"
            type="text"
            placeholder="Name this point…"
            aria-label="Snapshot name"
            bind:value={snapshotName}
          />
          <Button type="submit" size="sm">Save named</Button>
        </form>
      </div>
    {/if}
  </div>
</Panel>

<style>
  .history-panel {
    display: flex;
    flex-direction: column;
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-3);
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
  }

  .timeline {
    list-style: none;
    margin: 0;
    padding: var(--galley-space-2) 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 200px;
    overflow-y: auto;
  }

  .entry {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: var(--galley-radius-md);
    padding: var(--galley-space-1) var(--galley-space-3);
    cursor: pointer;
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .entry:hover {
    background: var(--bg-sunken);
    color: var(--fg);
  }

  .entry.selected {
    background: var(--bg-sunken);
    box-shadow: inset 2px 0 0 var(--accent);
    color: var(--fg);
  }

  .entry-name {
    font-weight: var(--galley-weight-bold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry-meta {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
    color: var(--fg-faint);
    font-size: var(--galley-text-xs);
  }

  .stats {
    display: flex;
    gap: var(--galley-space-1);
  }

  .added {
    color: var(--sage, #5e7561);
  }

  .removed {
    color: var(--ribbon, #a8362b);
  }

  .named-badge {
    background: var(--accent);
    color: var(--bg);
    font-size: 9px;
    padding: 1px 4px;
    border-radius: var(--galley-radius-sm);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
  }

  .diff-section {
    border-top: var(--galley-border-thin) solid var(--border);
    padding-top: var(--galley-space-2);
  }

  .diff-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--galley-space-3) var(--galley-space-2);
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
  }

  .diff-viewer {
    max-height: 180px;
    overflow-y: auto;
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    line-height: 1.5;
  }

  .diff-added {
    background: color-mix(in srgb, var(--sage, #5e7561) 15%, transparent);
    color: var(--fg);
  }

  .diff-removed {
    background: color-mix(in srgb, var(--ribbon, #a8362b) 15%, transparent);
    color: var(--fg);
  }

  .diff-context {
    color: var(--fg-muted);
  }

  .gutter {
    display: inline-block;
    width: 1ch;
    padding: 0 var(--galley-space-2);
    user-select: none;
  }

  .line-text {
    white-space: pre;
  }

  .diff-identical {
    margin: 0;
    padding: var(--galley-space-2) var(--galley-space-3);
    color: var(--fg-faint);
    font-size: var(--galley-text-xs);
  }

  .snapshot-form {
    padding: var(--galley-space-2) var(--galley-space-3);
    border-top: var(--galley-border-thin) solid var(--border);
  }

  .snapshot-form form {
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
</style>
