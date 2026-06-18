<script lang="ts">
  // The editing surface over the open document. A real CodeMirror 6 editor
  // (syntax highlighting, folding, themed for both Onionskin and Carbon) is
  // mounted over the canonical `.tex` source — the single source of truth. The
  // editor is built through an injectable factory so the component can be driven
  // with a fake in tests; the real factory is covered in `editor.test.ts`.
  import {
    createLatexEditor,
    type EditorFactory,
    type LanguageContext,
    type LatexEditor,
    type RevealRequest
  } from './editor';
  import { type Diagnostic } from './diagnostics';
  import { type KeymapMode } from './keymap-prefs';
  import { type SpellChecker } from './spell-check';

  let {
    documentName,
    content,
    dirty,
    diagnostics = [],
    reveal = null,
    language = undefined,
    keymapMode = 'default',
    spellChecker = null,
    onedit,
    oncreate = undefined,
    oneditorscroll = undefined,
    createEditor = createLatexEditor
  }: {
    documentName: string | null;
    content: string;
    dirty: boolean;
    diagnostics?: Diagnostic[];
    reveal?: RevealRequest | null;
    language?: LanguageContext;
    keymapMode?: KeymapMode;
    spellChecker?: SpellChecker | null;
    onedit: (content: string) => void;
    oncreate?: (editor: LatexEditor) => void;
    oneditorscroll?: (fraction: number) => void;
    createEditor?: EditorFactory;
  } = $props();

  /** Everything the editor surface reacts to, bundled for the mount action. */
  interface EditorInput {
    content: string;
    diagnostics: Diagnostic[];
    reveal: RevealRequest | null;
    keymapMode: KeymapMode;
    spellChecker: SpellChecker | null;
  }

  // Jump to a freshly-requested line, returning the nonce now acted on so a
  // repeat with the same nonce does not jump again.
  function applyReveal(
    editor: LatexEditor,
    request: RevealRequest | null,
    lastNonce: number | null
  ): number | null {
    if (request !== null && request.nonce !== lastNonce) {
      editor.gotoLine(request.line);
      return request.nonce;
    }
    return lastNonce;
  }

  const input = $derived<EditorInput>({ content, diagnostics, reveal, keymapMode, spellChecker });

  // A Svelte action: build the editor when the surface mounts, push external
  // content, diagnostics, jump requests, and mode changes in, then tear down.
  function mountEditor(node: HTMLElement, value: EditorInput) {
    const editor: LatexEditor = createEditor({
      parent: node,
      doc: value.content,
      onChange: (next) => onedit(next),
      language,
      keymapMode: value.keymapMode,
      spellChecker: value.spellChecker,
      onscroll: oneditorscroll
    });
    oncreate?.(editor);
    editor.setDiagnostics(value.diagnostics);
    let lastNonce = applyReveal(editor, value.reveal, null);
    return {
      update(next: EditorInput) {
        editor.setDoc(next.content);
        editor.setDiagnostics(next.diagnostics);
        lastNonce = applyReveal(editor, next.reveal, lastNonce);
        editor.setKeymapMode(next.keymapMode);
        editor.setSpellChecker(next.spellChecker);
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
    <div class="surface" use:mountEditor={input}></div>
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
