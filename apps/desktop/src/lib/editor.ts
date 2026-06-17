/**
 * The CodeMirror 6 LaTeX editor: a real code editor over the canonical `.tex`
 * source (the single source of truth — §0.5).
 *
 * The fold logic is a pure function so it carries its coverage without a DOM;
 * the rest is declarative CodeMirror configuration, themed through the
 * `--syn-*` design tokens so a single highlight style serves both Onionskin and
 * Carbon (the tokens swap with `data-theme`). The view itself is built behind a
 * small {@link EditorFactory} seam, so the editor component can be driven with a
 * fake in tests just like the project backend.
 */

import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { tags } from '@lezer/highlight';

/**
 * Find the fold range for a LaTeX environment that opens on the line spanning
 * `[lineFrom, lineTo)` of `doc`. Returns the character range to fold (from the
 * end of the `\begin{…}` line to the start of its matching `\end{…}`), honoring
 * nested environments of the same name, or `null` when the line opens no
 * foldable environment.
 */
export function latexFold(
  doc: string,
  lineFrom: number,
  lineTo: number
): { from: number; to: number } | null {
  const begin = /\\begin\{([^}]+)\}/.exec(doc.slice(lineFrom, lineTo));
  if (begin === null) {
    return null;
  }
  const env = begin[1];
  const token = /\\(begin|end)\{([^}]+)\}/g;
  token.lastIndex = lineTo;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = token.exec(doc)) !== null) {
    if (match[2] !== env) {
      continue;
    }
    if (match[1] === 'begin') {
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        return match.index > lineTo ? { from: lineTo, to: match.index } : null;
      }
    }
  }
  return null;
}

/** Highlight style binding LaTeX tokens to the themed `--syn-*` tokens. */
const highlightStyle = HighlightStyle.define([
  { tag: tags.tagName, color: 'var(--syn-command)' },
  { tag: tags.controlKeyword, color: 'var(--syn-keyword)' },
  { tag: tags.keyword, color: 'var(--syn-keyword)' },
  { tag: tags.bracket, color: 'var(--syn-bracket)' },
  { tag: tags.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: tags.string, color: 'var(--syn-string)' },
  { tag: tags.atom, color: 'var(--syn-math)' },
  { tag: tags.variableName, color: 'var(--syn-label)' }
]);

/** The editor chrome theme — surfaces, gutters, caret and selection, all from tokens. */
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--syn-text)',
    backgroundColor: 'var(--bg-sunken)',
    fontSize: 'var(--galley-text-md)'
  },
  '.cm-content': {
    fontFamily: 'var(--galley-font-mono)',
    caretColor: 'var(--ribbon)'
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ribbon)' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-sunken)',
    color: 'var(--syn-gutter-fg)',
    border: 'none'
  },
  '.cm-activeLine': { backgroundColor: 'var(--syn-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--syn-active-line)' },
  '&.cm-focused': { outline: 'none' }
});

/** The minimal shape of editor state the fold service needs. */
interface DocState {
  doc: { toString(): string };
}

/** Fold service over editor state — the line-range adapter onto {@link latexFold}. */
export function latexFoldService(
  state: DocState,
  lineFrom: number,
  lineTo: number
): { from: number; to: number } | null {
  return latexFold(state.doc.toString(), lineFrom, lineTo);
}

/** The minimal shape of a view update the change reporter reads. */
interface DocUpdate {
  docChanged: boolean;
  state: { doc: { toString(): string } };
}

/** Report a document change to `onChange`, ignoring updates that leave it intact. */
export function reportDocChange(update: DocUpdate, onChange: (value: string) => void): void {
  if (update.docChanged) {
    onChange(update.state.doc.toString());
  }
}

/** The full extension set for a Galley LaTeX editor, reporting edits to `onChange`. */
function latexExtensions(onChange: (value: string) => void): Extension {
  return [
    lineNumbers(),
    history(),
    highlightActiveLine(),
    bracketMatching(),
    indentOnInput(),
    codeFolding(),
    foldGutter(),
    foldService.of(latexFoldService),
    StreamLanguage.define(stex),
    syntaxHighlighting(highlightStyle),
    editorTheme,
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    EditorView.contentAttributes.of({ 'aria-label': 'LaTeX source' }),
    EditorView.updateListener.of((update) => reportDocChange(update, onChange))
  ];
}

/** Options for building an editor over a document. */
export interface LatexEditorOptions {
  /** The element the editor mounts into. */
  parent: HTMLElement;
  /** The initial document text. */
  doc: string;
  /** Called with the full text whenever the document changes. */
  onChange: (value: string) => void;
}

/** A live editor: the document can be replaced, and the editor torn down. */
export interface LatexEditor {
  /** Replace the document text (a no-op when it already matches). */
  setDoc(value: string): void;
  /** Tear the editor down and release its DOM. */
  destroy(): void;
}

/** Builds an editor; the seam that lets tests substitute a fake. */
export type EditorFactory = (options: LatexEditorOptions) => LatexEditor;

/** The real CodeMirror 6 editor factory. */
export const createLatexEditor: EditorFactory = ({ parent, doc, onChange }) => {
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: latexExtensions(onChange) })
  });
  return {
    setDoc(value) {
      const current = view.state.doc.toString();
      if (value !== current) {
        view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      }
    },
    destroy() {
      view.destroy();
    }
  };
};
