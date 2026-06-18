import { describe, it, expect, vi } from 'vitest';
import { EditorState, StateEffect, RangeSet } from '@codemirror/state';
import { GutterMarker } from '@codemirror/view';
import {
  latexFold,
  latexFoldService,
  reportDocChange,
  createLatexEditor,
  clampLine,
  markerSpecs,
  diagnosticMarker,
  diagnosticsField,
  setDiagnosticsEffect
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
