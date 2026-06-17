<script lang="ts">
  // The editing surface over the open document. A real CodeMirror 6 editor
  // (syntax highlighting, folding, themed for both Onionskin and Carbon) is
  // mounted over the canonical `.tex` source — the single source of truth. The
  // editor is built through an injectable factory so the component can be driven
  // with a fake in tests; the real factory is covered in `editor.test.ts`.
  import { createLatexEditor, type EditorFactory, type LatexEditor } from './editor';

  let {
    documentName,
    content,
    dirty,
    onedit,
    createEditor = createLatexEditor
  }: {
    documentName: string | null;
    content: string;
    dirty: boolean;
    onedit: (content: string) => void;
    createEditor?: EditorFactory;
  } = $props();

  // A Svelte action: build the editor when the surface mounts, push external
  // content changes in, and tear it down on unmount.
  function mountEditor(node: HTMLElement, value: string) {
    const editor: LatexEditor = createEditor({
      parent: node,
      doc: value,
      onChange: (next) => onedit(next)
    });
    return {
      update(next: string) {
        editor.setDoc(next);
      },
      destroy() {
        editor.destroy();
      }
    };
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
    <div class="surface" use:mountEditor={content}></div>
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
    overflow: auto;
    background: var(--bg-sunken);
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
