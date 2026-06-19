<script lang="ts">
  import { Panel, Button } from '@galley/ui-kit';
  import { pendingCount, type ReviewEntry } from './review';

  let {
    entries,
    onaccept,
    onreject
  }: {
    entries: ReviewEntry[];
    onaccept: (id: string) => void;
    onreject: (id: string) => void;
  } = $props();

  let collapsed = $state(false);

  const summary = $derived(
    pendingCount(entries) === 0
      ? 'No pending changes'
      : pendingCount(entries) === 1
        ? '1 pending change'
        : `${pendingCount(entries)} pending changes`
  );
</script>

<Panel>
  <div class="review-panel">
    <button
      class="toggle"
      aria-expanded={!collapsed}
      onclick={() => {
        collapsed = !collapsed;
      }}
    >
      <span class="label">Review</span>
      <span class="summary">{summary}</span>
    </button>
    {#if !collapsed}
      {#if entries.length === 0}
        <p class="empty">No changes to review.</p>
      {:else}
        <ul class="entries" aria-label="Pending changes">
          {#each entries as entry (entry.id)}
            <li class="entry">
              <div class="diff">
                <span class="before" aria-label="Before">{entry.before}</span>
                <span class="arrow" aria-hidden="true">→</span>
                <span class="after" aria-label="After">{entry.after}</span>
              </div>
              <div class="actions">
                <Button
                  size="sm"
                  variant="primary"
                  onclick={() => onaccept(entry.id)}
                  aria-label={`Accept change ${entry.id}`}>Accept</Button
                >
                <Button
                  size="sm"
                  onclick={() => onreject(entry.id)}
                  aria-label={`Reject change ${entry.id}`}>Reject</Button
                >
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</Panel>

<style>
  .review-panel {
    display: flex;
    flex-direction: column;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
    width: 100%;
    padding: var(--galley-space-2) var(--galley-space-3);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    color: var(--fg);
  }

  .toggle:hover {
    background: var(--bg-sunken);
  }

  .label {
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    font-weight: var(--galley-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
    color: var(--fg-muted);
    flex: 1 1 auto;
  }

  .summary {
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    color: var(--fg-faint);
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-3);
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
    font-family: var(--galley-font-mono);
  }

  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-2);
    padding: var(--galley-space-2) var(--galley-space-3);
    border-bottom: var(--galley-border-thin) solid var(--border);
  }

  .diff {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    overflow: hidden;
  }

  .before {
    color: var(--ribbon, #a8362b);
    text-decoration: line-through;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 8ch;
  }

  .arrow {
    color: var(--fg-faint);
    flex-shrink: 0;
  }

  .after {
    color: var(--sage, #5e7561);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 8ch;
  }

  .actions {
    display: flex;
    gap: var(--galley-space-2);
  }
</style>
