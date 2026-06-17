<script lang="ts">
  // A plain editing surface over the open document. The real CodeMirror 6
  // editor (syntax highlighting, folding, the visual mode) lands in v0.1.0; for
  // now this is a faithful textarea bound to the source — the single source of
  // truth — with a dirty marker on the tab.
  let {
    documentName,
    content,
    dirty,
    onedit
  }: {
    documentName: string | null;
    content: string;
    dirty: boolean;
    onedit: (content: string) => void;
  } = $props();

  function onInput(event: Event) {
    onedit((event.currentTarget as HTMLTextAreaElement).value);
  }
</script>

<section class="editor" aria-label="Editor">
  {#if documentName === null}
    <div class="empty">
      <p>Nothing on the galley yet.</p>
      <p class="hint">Create a project or open a folder to start typing.</p>
    </div>
  {:else}
    <header class="tab-bar">
      <span class="tab active">
        {documentName}{#if dirty}<span class="dot" aria-label="unsaved changes">•</span>{/if}
      </span>
    </header>
    <textarea
      class="surface"
      aria-label="Source"
      spellcheck="false"
      value={content}
      oninput={onInput}
    ></textarea>
  {/if}
</section>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    background: var(--bg);
  }

  .tab-bar {
    display: flex;
    align-items: stretch;
    height: var(--galley-titlebar-height);
    border-bottom: var(--galley-border-thin) solid var(--border);
    background: var(--surface);
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: var(--galley-space-1);
    padding: 0 var(--galley-space-4);
    font-size: var(--galley-text-sm);
    color: var(--fg-muted);
    border-right: var(--galley-border-thin) solid var(--border);
  }

  .tab.active {
    color: var(--fg);
    background: var(--bg);
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .dot {
    color: var(--accent);
    font-size: var(--galley-text-lg);
    line-height: 1;
  }

  .surface {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    resize: none;
    border: none;
    outline: none;
    padding: var(--galley-space-4);
    background: var(--bg-sunken);
    color: var(--syn-text);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-md);
    line-height: var(--galley-leading-normal);
    tab-size: 2;
  }

  .empty {
    margin: auto;
    text-align: center;
    color: var(--fg-faint);
  }

  .empty p {
    margin: 0;
    font-size: var(--galley-text-sm);
  }

  .hint {
    margin-top: var(--galley-space-2) !important;
    font-size: var(--galley-text-xs) !important;
  }
</style>
