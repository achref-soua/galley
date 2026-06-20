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
  import {
    createCheckpoint,
    applyCheckpoint,
    newLoopState,
    canContinueLoop,
    advanceLoop,
    isNetworkTool,
    type CheckpointEntry
  } from './autonomous';

  interface Props {
    backend: AiBackend;
    agentBackend: AgentToolBackend;
    projectRoot: string;
    projectTitle: string;
    content: string;
    onpatch: (before: string, after: string) => void;
    autonomous?: boolean;
    maxFixIterations?: number;
    onautonapply?: (newContent: string) => void;
    networkrequest?: (tool: string, arg: string) => Promise<boolean>;
  }

  let {
    backend,
    agentBackend,
    projectRoot,
    projectTitle,
    content,
    onpatch,
    autonomous = false,
    maxFixIterations = 3,
    onautonapply,
    networkrequest = async () => true
  }: Props = $props();

  let goal = $state('');
  let running = $state(false);
  let log: string[] = $state([]);
  let checkpoints: CheckpointEntry[] = $state([]);
  let generation = 0;

  async function runAgents() {
    const myGen = ++generation;
    running = true;
    log = [];
    checkpoints = [];
    // Local running content for autonomous mode: apply patches to this without
    // waiting for the parent to reflect the updated prop.
    let runningContent = content;

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

      let loopState = newLoopState(maxFixIterations);

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
          // Gate outbound network tools behind a permission prompt in autonomous mode.
          if (autonomous && isNetworkTool(tc.name)) {
            const allowed = await networkrequest(tc.name, tc.arg);
            if (!allowed) {
              log = [...log, `[Denied] ${tc.name}`];
              continue;
            }
          }
          const toolResult = await dispatchTool(agentBackend, tc.name, tc.arg);
          if (myGen !== generation) return;
          if (!toolResult.ok) {
            log = [...log, `[Tool error] ${toolResult.output}`];
          }
        } else {
          const patches = parsePatches(response, autonomous ? runningContent : content);
          if (autonomous) {
            for (const p of patches) {
              runningContent = p.after;
            }
            if (patches.length > 0) {
              const cpName = `Checkpoint ${checkpoints.length + 1}`;
              checkpoints = [...checkpoints, createCheckpoint(cpName, runningContent)];
              onautonapply?.(runningContent);
              log = [...log, `[Checkpoint] ${cpName}`];
            }
            if (step.role === 'compile-fixer') {
              loopState = advanceLoop(loopState);
              if (!canContinueLoop(loopState)) {
                log = [...log, '[Limit] compile-fix loop limit reached'];
                break;
              }
            }
          } else {
            for (const p of patches) {
              onpatch(p.before, p.after);
            }
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

  function handleRevert(name: string) {
    const reverted = applyCheckpoint(checkpoints, name);
    if (reverted !== null) {
      onautonapply?.(reverted);
    }
  }
</script>

<section aria-label="Agent orchestrator">
  <div class="header">
    <span class="title">Agents</span>
    {#if autonomous}
      <span class="mode-badge">Autonomous</span>
    {/if}
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
  {#if autonomous && checkpoints.length > 0}
    <div class="checkpoints" aria-label="Checkpoints">
      {#each checkpoints as cp (cp.name)}
        <div class="checkpoint-entry">
          <span class="cp-name">{cp.name}</span>
          <button class="cp-revert" onclick={() => handleRevert(cp.name)}>Revert</button>
        </div>
      {/each}
    </div>
  {/if}
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
    display: flex;
    align-items: center;
    gap: 6px;
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
  .mode-badge {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--ribbon, #a8362b);
    color: #fff;
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
  .checkpoints {
    border-top: 1px solid var(--border, #313244);
    padding: 6px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .checkpoint-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .cp-name {
    font-size: 0.8125rem;
    font-family: monospace;
    color: var(--text-muted, #a6adc8);
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cp-revert {
    flex: none;
    padding: 2px 8px;
    font-size: 0.75rem;
    background: transparent;
    border: 1px solid var(--border, #313244);
    color: var(--text-muted, #a6adc8);
  }
  .cp-revert:hover {
    border-color: var(--ribbon, #a8362b);
    color: var(--ribbon, #a8362b);
  }
</style>
