<script lang="ts">
  import type { AiBackend } from './ai-backend';
  import type { AgentToolBackend } from './agent-backend';
  import { dispatchTool } from './agent-backend';
  import { parsePatches } from './assistant';
  import {
    agentLabel,
    buildOrchestratorPrompt,
    buildAgentPrompt,
    parseSteps,
    parseToolCall
  } from './agents';

  interface Props {
    backend: AiBackend;
    agentBackend: AgentToolBackend;
    projectRoot: string;
    projectTitle: string;
    content: string;
    onpatch: (before: string, after: string) => void;
  }

  let { backend, agentBackend, projectRoot, projectTitle, content, onpatch }: Props = $props();

  let goal = $state('');
  let running = $state(false);
  let log: string[] = $state([]);
  let generation = 0;

  async function runAgents() {
    const myGen = ++generation;
    running = true;
    log = [];

    try {
      log = [...log, '[Orchestrator] Planning…'];
      const plan = await backend.complete(
        buildOrchestratorPrompt(goal, projectTitle),
        1024,
        projectRoot
      );
      if (myGen !== generation) return;

      const steps = parseSteps(plan);
      if (steps.length === 0) {
        log = [...log, '[Orchestrator] No plan could be formed.'];
        return;
      }

      for (const step of steps) {
        log = [...log, `[${agentLabel(step.role)}] ${step.task}`];
        const response = await backend.complete(
          buildAgentPrompt(step.role, step.task, ''),
          1024,
          projectRoot
        );
        if (myGen !== generation) return;

        const tc = parseToolCall(response);
        if (tc !== null && tc.name !== 'apply_patch') {
          const toolResult = await dispatchTool(agentBackend, tc.name, tc.arg);
          if (!toolResult.ok) {
            log = [...log, `[Tool error] ${toolResult.output}`];
          }
        } else {
          for (const p of parsePatches(response, content)) {
            onpatch(p.before, p.after);
          }
        }
      }

      log = [...log, '[Done]'];
    } catch (e) {
      if (myGen !== generation) return;
      log = [...log, `[Error] ${String(e)}`];
    } finally {
      if (myGen === generation) running = false;
    }
  }

  function stop() {
    generation++;
    running = false;
  }
</script>

<section aria-label="Agent orchestrator">
  <div class="header">
    <span class="title">Agents</span>
  </div>
  <div class="goal-bar">
    <label for="agent-goal">Goal</label>
    <input
      id="agent-goal"
      type="text"
      bind:value={goal}
      placeholder="e.g. add a related-work paragraph with 3 citations"
      disabled={running}
    />
    {#if running}
      <button onclick={stop}>Stop</button>
    {:else}
      <button onclick={runAgents} disabled={goal.trim().length === 0}>Run</button>
    {/if}
  </div>
  <div class="log" aria-label="Agent log" aria-live="polite">
    {#each log as entry, i (i)}
      <div class="entry">{entry}</div>
    {/each}
  </div>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    border-top: 1px solid var(--border, #313244);
  }
  .header {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border, #313244);
  }
  .title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #a6adc8);
  }
  .goal-bar {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    align-items: center;
    border-bottom: 1px solid var(--border, #313244);
  }
  label {
    font-size: 0.75rem;
    color: var(--text-muted, #a6adc8);
    white-space: nowrap;
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 3px 7px;
    border: 1px solid var(--border, #313244);
    border-radius: 4px;
    font-size: 0.8125rem;
    background: var(--input-bg, #1e1e2e);
    color: var(--text, #cdd6f4);
  }
  input:disabled {
    opacity: 0.5;
  }
  button {
    padding: 3px 10px;
    border: none;
    border-radius: 4px;
    font-size: 0.8125rem;
    cursor: pointer;
    background: var(--accent, #7c3aed);
    color: #fff;
    white-space: nowrap;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .log {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .entry {
    font-size: 0.8125rem;
    font-family: monospace;
    color: var(--text-muted, #a6adc8);
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
