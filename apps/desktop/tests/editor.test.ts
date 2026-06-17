import { describe, it, expect, vi } from 'vitest';
import { latexFold, latexFoldService, reportDocChange, createLatexEditor } from '../src/lib/editor';

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
});
