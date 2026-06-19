<script lang="ts">
  import { Button } from '@galley/ui-kit';
  import type { AiBackend } from './ai-backend';
  import {
    type PanelMessage,
    createUserPanelMessage,
    createAssistantPanelMessage,
    buildExplainPrompt,
    buildFixErrorPrompt,
    buildTransformPrompt,
    parsePatches
  } from './assistant';

  let {
    backend,
    projectRoot,
    content,
    selectedText,
    errorLog,
    onpatch
  }: {
    backend: AiBackend;
    projectRoot: string;
    content: string;
    selectedText: string;
    errorLog: string;
    onpatch: (before: string, after: string) => void;
  } = $props();

  // ── State ─────────────────────────────────────────────────────────────────

  let messages = $state<PanelMessage[]>([]);
  let busy = $state(false);
  let error = $state('');
  /** Monotonic counter. Stop increments it; sendMessage captures it and
   *  discards any response that arrives after a Stop. */
  let generation = $state(0);
  let intent = $state<'explain' | 'fix-error' | 'transform'>('explain');
  let nextId = 0;

  const MAX_TOKENS = 1024;

  // ── Derived ───────────────────────────────────────────────────────────────

  const fixErrorDisabled = $derived(busy || errorLog.length === 0);
  const transformDisabled = $derived(busy || selectedText.length === 0);
  const explainDisabled = $derived(busy);

  const sendDisabled = $derived(
    intent === 'fix-error'
      ? fixErrorDisabled
      : intent === 'transform'
        ? transformDisabled
        : explainDisabled
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  async function sendMessage() {
    const myGen = ++generation;
    busy = true;
    error = '';

    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    const msgs =
      intent === 'fix-error'
        ? buildFixErrorPrompt(errorLog, content, history)
        : intent === 'transform'
          ? buildTransformPrompt(selectedText, history)
          : buildExplainPrompt(selectedText, content, history);

    const userContent =
      intent === 'fix-error'
        ? `Fix compile error in current document.`
        : intent === 'transform'
          ? `Rewrite selected text.`
          : selectedText.length > 0
            ? `Explain: ${selectedText.slice(0, 60)}`
            : `Explain the current document.`;

    messages = [...messages, createUserPanelMessage(String(nextId++), userContent)];

    try {
      const text = await backend.complete(msgs, MAX_TOKENS, projectRoot);
      busy = false;
      if (myGen !== generation) return;
      const assistantMsg = createAssistantPanelMessage(String(nextId++), text);
      messages = [...messages, assistantMsg];
      for (const p of parsePatches(text, selectedText)) {
        onpatch(p.before, p.after);
      }
    } catch (e) {
      busy = false;
      if (myGen !== generation) return;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function stop() {
    generation++;
    busy = false;
  }
</script>

<div class="chat-panel" aria-label="AI assistant">
  <div class="chat-header">
    <span class="chat-title">Assistant</span>
    <div class="intent-tabs" role="tablist" aria-label="Assistant mode">
      <button
        role="tab"
        class="tab"
        class:active-tab={intent === 'explain'}
        aria-selected={intent === 'explain'}
        onclick={() => {
          intent = 'explain';
        }}>Explain</button
      >
      <button
        role="tab"
        class="tab"
        class:active-tab={intent === 'fix-error'}
        aria-selected={intent === 'fix-error'}
        onclick={() => {
          intent = 'fix-error';
        }}>Fix Error</button
      >
      <button
        role="tab"
        class="tab"
        class:active-tab={intent === 'transform'}
        aria-selected={intent === 'transform'}
        onclick={() => {
          intent = 'transform';
        }}>Transform</button
      >
    </div>
  </div>

  <div class="message-list" aria-label="Conversation" aria-live="polite">
    {#if messages.length === 0}
      <p class="empty-state">Nothing on the galley yet. Start a conversation.</p>
    {:else}
      {#each messages as msg (msg.id)}
        <div
          class="message"
          class:user-message={msg.role === 'user'}
          class:assistant-message={msg.role === 'assistant'}
        >
          <span class="message-role">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
          <p class="message-content">{msg.content}</p>
        </div>
      {/each}
    {/if}
    {#if error}
      <p class="chat-error" role="alert">{error}</p>
    {/if}
  </div>

  <div class="chat-footer">
    {#if busy}
      <Button variant="ghost" size="sm" onclick={stop}>Stop</Button>
    {:else}
      <Button variant="primary" size="sm" disabled={sendDisabled} onclick={() => void sendMessage()}
        >Send</Button
      >
    {/if}
    {#if intent === 'fix-error' && errorLog.length === 0}
      <span class="hint">No compile errors — run a build first.</span>
    {/if}
    {#if intent === 'transform' && selectedText.length === 0}
      <span class="hint">Select text in the editor to transform.</span>
    {/if}
  </div>
</div>

<style>
  .chat-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    border-top: var(--galley-border-thin) solid var(--border);
    background: var(--surface);
  }

  .chat-header {
    display: flex;
    align-items: center;
    gap: var(--galley-space-3);
    padding: var(--galley-space-2) var(--galley-space-3);
    border-bottom: var(--galley-border-thin) solid var(--border);
    flex: none;
  }

  .chat-title {
    font-size: var(--galley-text-xs);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
    color: var(--fg-muted);
    flex: none;
  }

  .intent-tabs {
    display: flex;
    gap: var(--galley-space-1);
  }

  .tab {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    font-size: var(--galley-text-xs);
    font-family: var(--galley-font-mono);
    padding: 2px var(--galley-space-2);
    border-radius: var(--galley-radius-sm);
    cursor: pointer;
  }

  .tab:hover {
    color: var(--fg);
    background: var(--bg-sunken);
  }

  .active-tab {
    color: var(--accent);
    background: var(--bg-sunken);
  }

  .message-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: var(--galley-space-3);
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-3);
  }

  .empty-state {
    color: var(--fg-faint);
    font-size: var(--galley-text-xs);
    margin: auto;
    text-align: center;
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-1);
  }

  .message-role {
    font-size: var(--galley-text-xs);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
    color: var(--fg-faint);
  }

  .user-message .message-role {
    color: var(--accent);
  }

  .message-content {
    font-size: var(--galley-text-sm);
    line-height: var(--galley-leading-normal);
    color: var(--fg);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }

  .chat-error {
    color: var(--error, #c0392b);
    font-size: var(--galley-text-xs);
    margin: 0;
  }

  .chat-footer {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
    padding: var(--galley-space-2) var(--galley-space-3);
    border-top: var(--galley-border-thin) solid var(--border);
    flex: none;
  }

  .hint {
    font-size: var(--galley-text-xs);
    color: var(--fg-faint);
  }
</style>
