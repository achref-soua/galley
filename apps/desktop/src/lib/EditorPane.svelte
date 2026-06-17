<script lang="ts">
  // A static, themed sample of the editor's syntax colours. The real
  // CodeMirror 6 editor lands in v0.1.0; this shows the syntax theme reacting to
  // the active palette and carries the empty-state voice. Building it from data
  // keeps the literal LaTeX braces out of Svelte's `{expression}` syntax.
  interface Token {
    text: string;
    cls: string;
  }

  const LINES: Token[][] = [
    [{ text: '% a galley proof', cls: 'c-comment' }],
    [
      { text: '\\documentclass', cls: 'c-keyword' },
      { text: '{', cls: 'c-bracket' },
      { text: 'article', cls: 'c-string' },
      { text: '}', cls: 'c-bracket' }
    ],
    [
      { text: '\\begin', cls: 'c-keyword' },
      { text: '{', cls: 'c-bracket' },
      { text: 'document', cls: 'c-string' },
      { text: '}', cls: 'c-bracket' }
    ],
    [
      { text: '  Hello from ', cls: 'c-plain' },
      { text: '\\textbf', cls: 'c-command' },
      { text: '{', cls: 'c-bracket' },
      { text: 'Galley', cls: 'c-plain' },
      { text: '}', cls: 'c-bracket' },
      { text: '. See ', cls: 'c-plain' },
      { text: '\\ref', cls: 'c-command' },
      { text: '{', cls: 'c-bracket' },
      { text: 'fig:proof', cls: 'c-label' },
      { text: '}', cls: 'c-bracket' },
      { text: '.', cls: 'c-plain' }
    ],
    [
      { text: '  ', cls: 'c-plain' },
      { text: '$E = mc^2$', cls: 'c-math' }
    ],
    [
      { text: '\\end', cls: 'c-keyword' },
      { text: '{', cls: 'c-bracket' },
      { text: 'document', cls: 'c-string' },
      { text: '}', cls: 'c-bracket' }
    ]
  ];
</script>

<section class="editor" aria-label="Editor">
  <header class="tab-bar">
    <span class="tab active">untitled.tex</span>
  </header>
  <div class="surface">
    <pre class="sample" aria-hidden="true">{#each LINES as line, i (i)}<span class="ln"
          >{i + 1}</span
        >{#each line as token, j (j)}<span class={token.cls}>{token.text}</span
          >{/each}{'\n'}{/each}</pre>
    <p class="empty">Nothing on the galley yet. Start typing.</p>
  </div>
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

  .surface {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    background: var(--bg-sunken);
  }

  .sample {
    margin: 0;
    padding: var(--galley-space-4) var(--galley-space-4) var(--galley-space-2);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-md);
    line-height: var(--galley-leading-normal);
    color: var(--syn-text);
    white-space: pre;
  }

  .ln {
    display: inline-block;
    width: 2.5ch;
    margin-right: var(--galley-space-3);
    text-align: right;
    color: var(--syn-gutter-fg);
    user-select: none;
  }

  .c-plain {
    color: var(--syn-text);
  }
  .c-comment {
    color: var(--syn-comment);
    font-style: italic;
  }
  .c-keyword {
    color: var(--syn-keyword);
  }
  .c-command {
    color: var(--syn-command);
  }
  .c-bracket {
    color: var(--syn-bracket);
  }
  .c-string {
    color: var(--syn-string);
  }
  .c-math {
    color: var(--syn-math);
  }
  .c-label {
    color: var(--syn-label);
  }

  .empty {
    padding: 0 var(--galley-space-4) var(--galley-space-5);
    margin: var(--galley-space-4) 0 0;
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
  }
</style>
