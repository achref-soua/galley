<script lang="ts">
  // The problems panel: the friendly, structured face of the compile log. It
  // lists the parsed diagnostics — worst first by line — each as an expandable
  // row showing a plain-language explanation; expanding reveals the raw log line
  // and, when the log placed it, a button that jumps the editor to the source.
  // Every entry expands, even one with no line, so a warning like a stray rerun
  // note is still inspectable. All ordering / de-duplication lives in
  // `diagnostics.ts`; this component just renders the result.
  import { Icon } from '@galley/ui-kit';
  import {
    type Diagnostic,
    diagnosticKey,
    locationLabel,
    problemList,
    severityIcon,
    severityLabel,
    summaryLabel
  } from './diagnostics';

  let {
    diagnostics,
    onjump
  }: {
    diagnostics: Diagnostic[];
    onjump: (line: number) => void;
  } = $props();

  let expanded = $state(true);
  // Keys of the rows whose detail is open. A fresh Set is assigned on each
  // change so Svelte tracks it.
  let openRows = $state(new Set<string>());

  const problems = $derived(problemList(diagnostics));
  const summary = $derived(summaryLabel(diagnostics));
  const hasProblems = $derived(problems.length > 0);

  function toggleRow(key: string) {
    const next = new Set(openRows);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    openRows = next;
  }
</script>

<section class="problems" aria-label="Problems">
  <header class="bar">
    <button
      type="button"
      class="header-toggle"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <span class="title">Problems</span>
      <span class="summary">{summary}</span>
    </button>
  </header>

  {#if expanded && hasProblems}
    <ul class="list">
      {#each problems as problem}
        {@const key = diagnosticKey(problem)}
        {@const open = openRows.has(key)}
        {@const located = problem.line}
        <li class={'row sev-' + problem.severity}>
          <button type="button" class="entry" aria-expanded={open} onclick={() => toggleRow(key)}>
            <Icon
              name={severityIcon(problem.severity)}
              label={severityLabel(problem.severity)}
              size={14}
            />
            <span class="loc">{locationLabel(problem)}</span>
            <span class="explain">{problem.explanation}</span>
            <span class="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
          </button>
          {#if open}
            <div class="detail">
              <p class="msg">{problem.message}</p>
              {#if located !== null}
                <button type="button" class="jump" onclick={() => onjump(located)}>
                  Jump to line {'' + located}
                </button>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if expanded}
    <p class="empty">Nothing to report — a clean galley.</p>
  {/if}
</section>

<style>
  .problems {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: none;
    border-top: var(--galley-border-thin) solid var(--border);
    background: var(--surface);
  }

  .bar {
    display: flex;
    align-items: stretch;
    height: var(--galley-titlebar-height);
  }

  .header-toggle {
    display: flex;
    align-items: center;
    gap: var(--galley-space-3);
    width: 100%;
    padding: 0 var(--galley-space-4);
    border: none;
    background: none;
    color: var(--fg-muted);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .header-toggle:hover {
    color: var(--fg);
  }

  .title {
    font-size: var(--galley-text-xs);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
  }

  .summary {
    font-size: var(--galley-text-xs);
    color: var(--fg-faint);
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: auto;
    max-height: 11rem;
  }

  .row {
    border-top: var(--galley-border-thin) solid var(--border);
    border-left: 2px solid transparent;
  }

  .row.sev-error {
    border-left-color: var(--ribbon);
  }

  .row.sev-warning {
    border-left-color: var(--syn-keyword);
  }

  .row.sev-badbox {
    border-left-color: var(--syn-comment);
  }

  .entry {
    display: flex;
    align-items: baseline;
    gap: var(--galley-space-3);
    width: 100%;
    padding: var(--galley-space-2) var(--galley-space-4);
    border: none;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .entry:hover {
    background: var(--bg-sunken);
  }

  .loc {
    flex: none;
    min-width: 5rem;
    color: var(--fg-faint);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
  }

  /* Hidden when the diagnostic had no location to show. */
  .loc:empty {
    display: none;
  }

  .explain {
    flex: 1 1 auto;
    font-size: var(--galley-text-sm);
  }

  .chevron {
    flex: none;
    color: var(--fg-faint);
    font-size: var(--galley-text-xs);
  }

  .detail {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--galley-space-2);
    padding: 0 var(--galley-space-4) var(--galley-space-3) calc(var(--galley-space-4) + 22px);
  }

  .msg {
    margin: 0;
    color: var(--fg-faint);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    white-space: pre-wrap;
  }

  .jump {
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-sm);
    background: transparent;
    color: var(--fg-muted);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    padding: 2px var(--galley-space-2);
    cursor: pointer;
  }

  .jump:hover {
    color: var(--fg);
    border-color: var(--fg-faint);
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-3) var(--galley-space-4);
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
  }
</style>
