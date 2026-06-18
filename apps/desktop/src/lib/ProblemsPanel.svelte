<script lang="ts">
  // The problems panel: the friendly, structured face of the compile log. It
  // lists the parsed diagnostics — worst first by line — with a plain-language
  // explanation, the raw message, and a click that jumps the editor to the
  // source line. All ordering / de-duplication lives in `diagnostics.ts`; this
  // component just renders the result.
  import { Icon } from '@galley/ui-kit';
  import {
    type Diagnostic,
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

  const problems = $derived(problemList(diagnostics));
  const summary = $derived(summaryLabel(diagnostics));
  const hasProblems = $derived(problems.length > 0);
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
        {@const located = problem.line}
        <li class={'row sev-' + problem.severity}>
          {#if located !== null}
            <button type="button" class="entry" onclick={() => onjump(located)}>
              <Icon
                name={severityIcon(problem.severity)}
                label={severityLabel(problem.severity)}
                size={14}
              />
              <span class="loc">{locationLabel(problem)}</span>
              <span class="explain">{problem.explanation}</span>
              <span class="msg">{problem.message}</span>
            </button>
          {:else}
            <div class="entry static">
              <Icon
                name={severityIcon(problem.severity)}
                label={severityLabel(problem.severity)}
                size={14}
              />
              <span class="loc">{locationLabel(problem)}</span>
              <span class="explain">{problem.explanation}</span>
              <span class="msg">{problem.message}</span>
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
  }

  button.entry {
    cursor: pointer;
  }

  button.entry:hover {
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

  .msg {
    flex: none;
    color: var(--fg-faint);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
  }

  .empty {
    margin: 0;
    padding: var(--galley-space-3) var(--galley-space-4);
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
  }
</style>
