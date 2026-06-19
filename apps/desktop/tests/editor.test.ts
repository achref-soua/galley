import { describe, it, expect, vi } from 'vitest';
import { EditorState, StateEffect, RangeSet } from '@codemirror/state';
import { GutterMarker } from '@codemirror/view';
import { CompletionContext } from '@codemirror/autocomplete';
import {
  latexFold,
  latexFoldService,
  reportDocChange,
  createLatexEditor,
  clampLine,
  markerSpecs,
  diagnosticMarker,
  diagnosticsField,
  setDiagnosticsEffect,
  LATEX_SNIPPETS,
  latexSnippetSource,
  keymapExtension
} from '../src/lib/editor';
import type { Diagnostic } from '../src/lib/diagnostics';

function diag(over: Partial<Diagnostic> = {}): Diagnostic {
  return {
    severity: 'error',
    kind: 'latex-error',
    message: 'boom',
    file: null,
    line: 1,
    explanation: 'why',
    ...over
  };
}

const DOC = `\\documentclass{article}
\\begin{document}
Hello.
\\end{document}
`;

describe('latexFold', () => {
  // Offsets of the `\begin{document}` line within DOC.
  const beginLineFrom = DOC.indexOf('\\begin{document}');
  const beginLineTo = beginLineFrom + '\\begin{document}'.length;

  it('folds from the end of a begin line to its matching end', () => {
    const range = latexFold(DOC, beginLineFrom, beginLineTo);
    expect(range).not.toBeNull();
    expect(range!.from).toBe(beginLineTo);
    expect(range!.to).toBe(DOC.indexOf('\\end{document}'));
  });

  it('returns null for a line that opens no environment', () => {
    const from = 0;
    const to = DOC.indexOf('\n');
    expect(latexFold(DOC, from, to)).toBeNull();
  });

  it('matches the correct end across nested environments of the same name', () => {
    const doc = `\\begin{itemize}
\\begin{itemize}
inner
\\end{itemize}
outer
\\end{itemize}`;
    const lineTo = doc.indexOf('\n');
    const range = latexFold(doc, 0, lineTo);
    expect(range!.to).toBe(doc.lastIndexOf('\\end{itemize}'));
  });

  it('returns null when the environment is never closed', () => {
    const doc = '\\begin{proof}\nstill going';
    expect(latexFold(doc, 0, doc.indexOf('\n'))).toBeNull();
  });

  it('returns null when the matching end sits right at the begin-line end', () => {
    // The `\end{a}` starts exactly where the begin line ends, so there is no
    // foldable body between them.
    const doc = '\\begin{a}\\end{a}';
    expect(latexFold(doc, 0, '\\begin{a}'.length)).toBeNull();
  });

  it('ignores ends of other environments', () => {
    const doc = `\\begin{outer}
\\end{inner}
\\end{outer}`;
    const range = latexFold(doc, 0, doc.indexOf('\n'));
    expect(range!.to).toBe(doc.indexOf('\\end{outer}'));
  });
});

describe('latexFoldService', () => {
  it('reads the document from editor state and delegates to latexFold', () => {
    const state = { doc: { toString: () => '\\begin{x}\nbody\n\\end{x}' } };
    const range = latexFoldService(state, 0, '\\begin{x}'.length);
    expect(range).not.toBeNull();
    expect(range!.to).toBe('\\begin{x}\nbody\n'.length);
  });
});

describe('reportDocChange', () => {
  it('reports the new text only when the document changed', () => {
    const onChange = vi.fn();
    reportDocChange({ docChanged: true, state: { doc: { toString: () => 'new' } } }, onChange);
    expect(onChange).toHaveBeenCalledWith('new');

    onChange.mockClear();
    reportDocChange({ docChanged: false, state: { doc: { toString: () => 'x' } } }, onChange);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('createLatexEditor', () => {
  it('mounts a CodeMirror editor, reports edits, replaces and tears down', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onChange = vi.fn();

    const editor = createLatexEditor({ parent: host, doc: 'hello', onChange });
    expect(host.querySelector('.cm-editor')).not.toBeNull();

    // Replacing the document with a different value reports the change.
    editor.setDoc('world');
    expect(onChange).toHaveBeenCalledWith('world');

    // Setting the same value is a no-op (no further change reported).
    onChange.mockClear();
    editor.setDoc('world');
    expect(onChange).not.toHaveBeenCalled();

    editor.destroy();
    expect(host.querySelector('.cm-editor')).toBeNull();
    host.remove();
  });

  it('renders diagnostics in the gutter and jumps the cursor to a line', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = createLatexEditor({ parent: host, doc: 'a\nb\nc\nd', onChange: vi.fn() });

    editor.setDiagnostics([
      diag({ severity: 'warning', line: 2 }),
      diag({ severity: 'error', line: 2 }),
      diag({ severity: 'badbox', line: 99 }),
      diag({ line: null })
    ]);
    // A marker dot is rendered in the diagnostics gutter; line 2's worst
    // severity is the error, so it carries the error class.
    const markers = host.querySelectorAll('.cm-diag-marker');
    expect(markers.length).toBeGreaterThan(0);
    expect(host.querySelector('.cm-diag-error')).not.toBeNull();

    // Jumping moves the cursor to (the clamped) line start.
    editor.gotoLine(3);
    editor.gotoLine(500); // clamped to the last line — must not throw

    editor.destroy();
    host.remove();
  });

  it('currentLine returns the one-based line number of the cursor position', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = createLatexEditor({
      parent: host,
      doc: 'line one\nline two\nline three',
      onChange: vi.fn()
    });
    // Default cursor is at the start → line 1.
    expect(editor.currentLine()).toBe(1);
    // After gotoLine(2) the cursor moves to line 2.
    editor.gotoLine(2);
    expect(editor.currentLine()).toBe(2);
    editor.destroy();
    host.remove();
  });

  it('insertAtCursor inserts text at the cursor and fires onChange', () => {
    const onChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = createLatexEditor({ parent: host, doc: 'Hello world', onChange });
    onChange.mockClear();
    editor.insertAtCursor(' snippet');
    // onChange is called with the new doc content.
    expect(onChange).toHaveBeenCalled();
    const newDoc: string = onChange.mock.calls[0][0] as string;
    expect(newDoc).toContain('snippet');
    editor.destroy();
    host.remove();
  });
});

describe('clampLine', () => {
  it('clamps a line into the document range', () => {
    expect(clampLine(5, 10)).toBe(5);
    expect(clampLine(0, 10)).toBe(1);
    expect(clampLine(99, 10)).toBe(10);
  });
});

describe('markerSpecs', () => {
  it('keeps the worst severity per line, clamps, drops unlocated, and sorts', () => {
    const specs = markerSpecs(
      [
        diag({ severity: 'warning', line: 3 }),
        diag({ severity: 'error', line: 3 }), // worse — replaces the warning
        diag({ severity: 'warning', line: 3 }), // not worse — kept as error
        diag({ severity: 'badbox', line: 1 }),
        diag({ severity: 'error', line: 50 }), // clamped to the last line (5)
        diag({ line: null }) // no line — dropped
      ],
      5
    );
    expect(specs).toEqual([
      { line: 1, severity: 'badbox' },
      { line: 3, severity: 'error' },
      { line: 5, severity: 'error' }
    ]);
  });
});

describe('diagnosticMarker', () => {
  it('compares equal only to another marker of the same severity', () => {
    const error = diagnosticMarker('error');
    const otherError = diagnosticMarker('error');
    const warning = diagnosticMarker('warning');
    // A bare gutter marker of a different type is never equal.
    const foreign = new (class extends GutterMarker {})();

    expect(error.eq(otherError)).toBe(true);
    expect(error.eq(warning)).toBe(false);
    expect(error.eq(foreign)).toBe(false);
  });
});

describe('diagnosticsField', () => {
  it('replaces its markers on the effect, ignores others, and maps across edits', () => {
    const foreign = StateEffect.define<number>();
    let state = EditorState.create({ doc: 'one\ntwo', extensions: [diagnosticsField] });

    // A foreign effect leaves the (empty) marker set alone.
    state = state.update({ effects: foreign.of(1) }).state;
    expect(state.field(diagnosticsField).size).toBe(0);

    // Our effect replaces the marker set.
    state = state.update({ effects: setDiagnosticsEffect.of(RangeSet.empty) }).state;
    expect(state.field(diagnosticsField).size).toBe(0);

    // A plain edit maps the marker set across the change without an effect.
    state = state.update({ changes: { from: 0, insert: 'x' } }).state;
    expect(state.field(diagnosticsField).size).toBe(0);
  });
});

describe('LATEX_SNIPPETS', () => {
  it('contains at least 10 built-in LaTeX snippets', () => {
    expect(LATEX_SNIPPETS.length).toBeGreaterThanOrEqual(10);
  });

  it('includes the \\begin{}…\\end{} and \\frac{}{} snippets', () => {
    const labels = LATEX_SNIPPETS.map((s) => s.label);
    expect(labels).toContain('\\begin{}…\\end{}');
    expect(labels).toContain('\\frac{}{}');
  });
});

describe('latexSnippetSource', () => {
  function makeContext(doc: string, pos: number, explicit = false): CompletionContext {
    const state = EditorState.create({ doc });
    return new CompletionContext(state, pos, explicit);
  }

  it('returns null when at a word boundary with no explicit trigger', () => {
    // At position 0 with no backslash typed, completionStart === pos → return null.
    expect(latexSnippetSource(makeContext('', 0, false))).toBeNull();
  });

  it('returns completions when the cursor is after a backslash', () => {
    const ctx = makeContext('\\fr', 3, false);
    const result = latexSnippetSource(ctx);
    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);
  });

  it('returns all snippets on an explicit request at position 0', () => {
    const ctx = makeContext('', 0, true);
    const result = latexSnippetSource(ctx);
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(LATEX_SNIPPETS.length);
  });
});

describe('keymapExtension', () => {
  it('returns a non-null extension for "default" mode', () => {
    expect(keymapExtension('default')).toBeTruthy();
  });

  it('returns a non-null extension for "vim" mode', () => {
    expect(keymapExtension('vim')).toBeTruthy();
  });

  it('returns different extensions for "vim" and "default"', () => {
    const def = keymapExtension('default');
    const vim = keymapExtension('vim');
    // They are distinct objects, not the same reference.
    expect(def).not.toBe(vim);
  });
});

describe('createLatexEditor — setKeymapMode and setSpellChecker', () => {
  it('switches keymap mode at runtime without throwing', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = createLatexEditor({ parent: host, doc: 'test', onChange: vi.fn() });
    expect(() => editor.setKeymapMode('vim')).not.toThrow();
    expect(() => editor.setKeymapMode('default')).not.toThrow();
    editor.destroy();
    host.remove();
  });

  it('enables and disables spell-check at runtime without throwing', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fakeChecker = { correct: () => true };
    const editor = createLatexEditor({ parent: host, doc: 'test', onChange: vi.fn() });
    expect(() => editor.setSpellChecker(fakeChecker)).not.toThrow();
    expect(() => editor.setSpellChecker(null)).not.toThrow();
    editor.destroy();
    host.remove();
  });

  it('constructs with explicit keymapMode and spellChecker options', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fakeChecker = { correct: () => true };
    const editor = createLatexEditor({
      parent: host,
      doc: 'doc',
      onChange: vi.fn(),
      keymapMode: 'vim',
      spellChecker: fakeChecker
    });
    expect(host.querySelector('.cm-editor')).not.toBeNull();
    editor.destroy();
    host.remove();
  });

  it('calls onscroll when provided and fires on a scroll event', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onscroll = vi.fn();
    const editor = createLatexEditor({ parent: host, doc: 'test', onChange: vi.fn(), onscroll });
    const scroller = host.querySelector('.cm-scroller') as HTMLElement | null;
    if (scroller !== null) {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    expect(onscroll).toHaveBeenCalled();
    editor.destroy();
    host.remove();
  });

  it('constructs without onscroll and does not throw on scroll', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = createLatexEditor({ parent: host, doc: 'test', onChange: vi.fn() });
    const scroller = host.querySelector('.cm-scroller') as HTMLElement | null;
    expect(() => {
      if (scroller !== null) scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    }).not.toThrow();
    editor.destroy();
    host.remove();
  });
});

// ---------------------------------------------------------------------------
// Visual mode: BulletWidget, ChipWidget, buildVisualDecorations, setViewMode
// ---------------------------------------------------------------------------
import {
  BulletWidget,
  ChipWidget,
  buildVisualDecorations,
  visualPlugin,
  visualHeadingPromote,
  visualHeadingDemote,
  visualToggleBold,
  visualToggleItalic,
  visualInsertItem,
  VISUAL_KEY_BINDINGS
} from '../src/lib/editor';
import { EditorView } from '@codemirror/view';
import { EditorState as ES2 } from '@codemirror/state';

describe('BulletWidget', () => {
  it('toDOM produces a bullet span', () => {
    const w = new BulletWidget();
    const dom = w.toDOM();
    expect(dom.tagName).toBe('SPAN');
    expect(dom.className).toContain('cm-visual-bullet');
    expect(dom.textContent).toBe('•');
    expect(dom.getAttribute('aria-hidden')).toBe('true');
  });

  it('eq returns true for same type', () => {
    expect(new BulletWidget().eq(new BulletWidget())).toBe(true);
  });

  it('eq returns false for ChipWidget', () => {
    expect(new BulletWidget().eq(new ChipWidget('x', 'cls'))).toBe(false);
  });
});

describe('ChipWidget', () => {
  it('toDOM produces a chip span with correct text and class', () => {
    const w = new ChipWidget('x^2', 'cm-visual-math');
    const dom = w.toDOM();
    expect(dom.tagName).toBe('SPAN');
    expect(dom.className).toContain('cm-visual-chip');
    expect(dom.className).toContain('cm-visual-math');
    expect(dom.textContent).toBe('x^2');
  });

  it('eq returns true for same text and class', () => {
    const a = new ChipWidget('t', 'c');
    const b = new ChipWidget('t', 'c');
    expect(a.eq(b)).toBe(true);
  });

  it('eq returns false when text differs', () => {
    expect(new ChipWidget('a', 'c').eq(new ChipWidget('b', 'c'))).toBe(false);
  });

  it('eq returns false when class differs', () => {
    expect(new ChipWidget('a', 'c').eq(new ChipWidget('a', 'd'))).toBe(false);
  });

  it('eq returns false for BulletWidget', () => {
    expect(new ChipWidget('x', 'c').eq(new BulletWidget())).toBe(false);
  });
});

describe('buildVisualDecorations', () => {
  it('returns an empty set for an empty document', () => {
    const set = buildVisualDecorations('');
    let count = 0;
    const it2 = set.iter();
    while (it2.value !== null) {
      count++;
      it2.next();
    }
    expect(count).toBe(0);
  });

  it('produces decorations for a heading', () => {
    const set = buildVisualDecorations('\\section{Introduction}');
    let count = 0;
    const it2 = set.iter();
    while (it2.value !== null) {
      count++;
      it2.next();
    }
    // replace(\section{) + mark(Introduction) + replace(}) = 3
    expect(count).toBe(3);
  });

  it('produces decorations for bold markup', () => {
    const set = buildVisualDecorations('\\textbf{hello}');
    let count = 0;
    const it2 = set.iter();
    while (it2.value !== null) {
      count++;
      it2.next();
    }
    expect(count).toBe(3); // replace + mark + replace
  });

  it('produces decorations for italic markup', () => {
    const set = buildVisualDecorations('\\emph{test}');
    let count = 0;
    const it2 = set.iter();
    while (it2.value !== null) {
      count++;
      it2.next();
    }
    expect(count).toBe(3);
  });

  it('produces a decoration for \\item', () => {
    const set = buildVisualDecorations('\\item text');
    let count = 0;
    const it2 = set.iter();
    while (it2.value !== null) {
      count++;
      it2.next();
    }
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('produces a decoration for inline math', () => {
    const set = buildVisualDecorations('The value $x^2$.');
    let count = 0;
    const it2 = set.iter();
    while (it2.value !== null) {
      count++;
      it2.next();
    }
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('produces a decoration for \\includegraphics', () => {
    const set = buildVisualDecorations('\\includegraphics{fig.png}');
    let count = 0;
    const it2 = set.iter();
    while (it2.value !== null) {
      count++;
      it2.next();
    }
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('produces a decoration for \\url', () => {
    const set = buildVisualDecorations('\\url{https://example.com}');
    let count = 0;
    const it2 = set.iter();
    while (it2.value !== null) {
      count++;
      it2.next();
    }
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('skips overlapping ranges (lastTo filter)', () => {
    // \textbf{\emph{nested}} — outer match covers part of inner; lastTo filter drops the inner
    // In practice [^}]* won't match nested braces; this test just confirms no crash
    expect(() => buildVisualDecorations('\\textbf{a} \\emph{b}')).not.toThrow();
  });

  it('handles an empty heading title (two ranges share the same from, exercises sort tiebreaker)', () => {
    // \section{} produces titleFrom === titleTo — the mark and the closing-brace replace
    // both start at the same position, exercising the b.to - a.to tiebreaker in the sort.
    expect(() => buildVisualDecorations('\\section{}')).not.toThrow();
    const set = buildVisualDecorations('\\section{}');
    let count = 0;
    set.between(0, '\\section{}'.length, () => {
      count++;
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe('visualPlugin', () => {
  it('creates a CM6 extension without throwing', () => {
    expect(() => visualPlugin()).not.toThrow();
  });

  it('applies decorations to an EditorView and responds to doc changes', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const plugin = visualPlugin();
    const view = new EditorView({
      parent: host,
      state: ES2.create({
        doc: '\\section{Hello}',
        extensions: [plugin]
      })
    });
    // The plugin's update() fires after dispatch — no throw expected
    expect(() =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '\\section{World}' } })
    ).not.toThrow();
    view.destroy();
    host.remove();
  });
});

describe('createLatexEditor — setViewMode', () => {
  it('toggles to visual mode and back without throwing', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = createLatexEditor({
      parent: host,
      doc: '\\section{Title}\n\\item text\n$x^2$',
      onChange: vi.fn()
    });
    expect(() => editor.setViewMode('visual')).not.toThrow();
    expect(() => editor.setViewMode('code')).not.toThrow();
    editor.destroy();
    host.remove();
  });

  it('constructs with viewMode visual without throwing', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = createLatexEditor({
      parent: host,
      doc: '\\section{Title}',
      onChange: vi.fn(),
      viewMode: 'visual'
    });
    expect(host.querySelector('.cm-editor')).not.toBeNull();
    editor.destroy();
    host.remove();
  });
});

// ---------------------------------------------------------------------------
// Visual editing commands
// ---------------------------------------------------------------------------

function makeView(doc: string, cursorPos?: number): EditorView {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const selection = cursorPos !== undefined ? { anchor: cursorPos } : undefined;
  return new EditorView({
    parent: host,
    state: ES2.create({ doc, ...(selection ? { selection } : {}) })
  });
}

describe('visualHeadingPromote', () => {
  it('returns false on a non-heading line', () => {
    const view = makeView('hello world', 0);
    expect(visualHeadingPromote(view)).toBe(false);
    view.destroy();
  });

  it('returns false on \\part (already at top)', () => {
    const view = makeView('\\part{P}', 0);
    expect(visualHeadingPromote(view)).toBe(false);
    view.destroy();
  });

  it('promotes \\section → \\chapter and returns true', () => {
    const view = makeView('\\section{S}', 0);
    expect(visualHeadingPromote(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('\\chapter{S}');
    view.destroy();
  });

  it('promotes \\subsection → \\section', () => {
    const view = makeView('\\subsection{M}', 0);
    visualHeadingPromote(view);
    expect(view.state.doc.toString()).toBe('\\section{M}');
    view.destroy();
  });
});

describe('visualHeadingDemote', () => {
  it('returns false on a non-heading line', () => {
    const view = makeView('plain text', 0);
    expect(visualHeadingDemote(view)).toBe(false);
    view.destroy();
  });

  it('returns false on \\subparagraph (already at bottom)', () => {
    const view = makeView('\\subparagraph{F}', 0);
    expect(visualHeadingDemote(view)).toBe(false);
    view.destroy();
  });

  it('demotes \\section → \\subsection and returns true', () => {
    const view = makeView('\\section{S}', 0);
    expect(visualHeadingDemote(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('\\subsection{S}');
    view.destroy();
  });

  it('demotes \\chapter → \\section', () => {
    const view = makeView('\\chapter{C}', 0);
    visualHeadingDemote(view);
    expect(view.state.doc.toString()).toBe('\\section{C}');
    view.destroy();
  });
});

describe('visualToggleBold', () => {
  it('wraps selected text with \\textbf{…} and returns true', () => {
    const doc = 'hello world';
    const view = new EditorView({
      parent: (() => {
        const h = document.createElement('div');
        document.body.appendChild(h);
        return h;
      })(),
      state: ES2.create({ doc, selection: { anchor: 6, head: 11 } })
    });
    expect(visualToggleBold(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('hello \\textbf{world}');
    view.destroy();
  });

  it('unwraps \\textbf{…} when selection is the content', () => {
    const doc = '\\textbf{hello}';
    const view = new EditorView({
      parent: (() => {
        const h = document.createElement('div');
        document.body.appendChild(h);
        return h;
      })(),
      state: ES2.create({ doc, selection: { anchor: 8, head: 13 } })
    });
    visualToggleBold(view);
    expect(view.state.doc.toString()).toBe('hello');
    view.destroy();
  });
});

describe('visualToggleItalic', () => {
  it('wraps selected text with \\textit{…} and returns true', () => {
    const doc = 'hello world';
    const view = new EditorView({
      parent: (() => {
        const h = document.createElement('div');
        document.body.appendChild(h);
        return h;
      })(),
      state: ES2.create({ doc, selection: { anchor: 6, head: 11 } })
    });
    expect(visualToggleItalic(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('hello \\textit{world}');
    view.destroy();
  });

  it('unwraps \\emph{…} when selection is the content', () => {
    const doc = '\\emph{hello}';
    const view = new EditorView({
      parent: (() => {
        const h = document.createElement('div');
        document.body.appendChild(h);
        return h;
      })(),
      state: ES2.create({ doc, selection: { anchor: 6, head: 11 } })
    });
    visualToggleItalic(view);
    expect(view.state.doc.toString()).toBe('hello');
    view.destroy();
  });
});

describe('visualInsertItem', () => {
  it('returns false when selection is non-empty', () => {
    const view = new EditorView({
      parent: (() => {
        const h = document.createElement('div');
        document.body.appendChild(h);
        return h;
      })(),
      state: ES2.create({ doc: '\\item text', selection: { anchor: 0, head: 5 } })
    });
    expect(visualInsertItem(view)).toBe(false);
    view.destroy();
  });

  it('returns false when cursor is not on a \\item line', () => {
    const view = makeView('plain text', 0);
    expect(visualInsertItem(view)).toBe(false);
    view.destroy();
  });

  it('returns false when cursor is not at end of line', () => {
    // cursor at position 1, not end
    const view = makeView('\\item text', 1);
    expect(visualInsertItem(view)).toBe(false);
    view.destroy();
  });

  it('inserts new \\item at end of \\item line and returns true', () => {
    const doc = '\\item text';
    const view = makeView(doc, doc.length);
    expect(visualInsertItem(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('\\item text\n\\item ');
    view.destroy();
  });

  it('preserves indentation of the current \\item line', () => {
    const doc = '  \\item text';
    const view = makeView(doc, doc.length);
    visualInsertItem(view);
    expect(view.state.doc.toString()).toBe('  \\item text\n  \\item ');
    view.destroy();
  });
});

describe('VISUAL_KEY_BINDINGS', () => {
  it('has 5 bindings', () => {
    expect(VISUAL_KEY_BINDINGS).toHaveLength(5);
  });

  it('contains Shift-Tab, Tab, Mod-b, Mod-i, Enter', () => {
    const keys = VISUAL_KEY_BINDINGS.map((b) => b.key);
    expect(keys).toContain('Shift-Tab');
    expect(keys).toContain('Tab');
    expect(keys).toContain('Mod-b');
    expect(keys).toContain('Mod-i');
    expect(keys).toContain('Enter');
  });

  it('all bindings have a run function', () => {
    for (const b of VISUAL_KEY_BINDINGS) {
      expect(typeof b.run).toBe('function');
    }
  });
});

describe('createLatexEditor — toggleBold/toggleItalic/promoteHeading/demoteHeading', () => {
  function makeEditor(doc: string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ed = createLatexEditor({ parent: host, doc, onChange: vi.fn() });
    return { ed, host };
  }

  it('toggleBold does not throw', () => {
    const { ed, host } = makeEditor('hello world');
    expect(() => ed.toggleBold()).not.toThrow();
    ed.destroy();
    host.remove();
  });

  it('toggleItalic does not throw', () => {
    const { ed, host } = makeEditor('hello world');
    expect(() => ed.toggleItalic()).not.toThrow();
    ed.destroy();
    host.remove();
  });

  it('promoteHeading does not throw', () => {
    const { ed, host } = makeEditor('\\section{S}');
    expect(() => ed.promoteHeading()).not.toThrow();
    ed.destroy();
    host.remove();
  });

  it('demoteHeading does not throw', () => {
    const { ed, host } = makeEditor('\\section{S}');
    expect(() => ed.demoteHeading()).not.toThrow();
    ed.destroy();
    host.remove();
  });
});
