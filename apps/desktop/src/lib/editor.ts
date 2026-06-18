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

import { EditorState, StateEffect, StateField, RangeSet, type Extension } from '@codemirror/state';
import {
  EditorView,
  GutterMarker,
  gutter,
  keymap,
  lineNumbers,
  highlightActiveLine
} from '@codemirror/view';
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
import { type Diagnostic, type Severity, severityRank } from './diagnostics';

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
  '&.cm-focused': { outline: 'none' },
  '.cm-diag-gutter': { minWidth: '1em' },
  '.cm-diag-marker': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7em',
    lineHeight: '1'
  },
  '.cm-diag-error': { color: 'var(--ribbon)' },
  '.cm-diag-warning': { color: 'var(--syn-keyword)' },
  '.cm-diag-badbox': { color: 'var(--syn-comment)' }
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

/** A gutter marker spec: a 1-based line and the worst severity sitting on it. */
export interface LineMarker {
  /** 1-based source line. */
  line: number;
  /** The worst severity on that line. */
  severity: Severity;
}

/** Clamp a 1-based line into `[1, lineCount]` (and never below 1). */
export function clampLine(line: number, lineCount: number): number {
  const last = Math.max(lineCount, 1);
  if (line < 1) {
    return 1;
  }
  if (line > last) {
    return last;
  }
  return line;
}

/**
 * Reduce diagnostics to one gutter marker per document line — the worst severity
 * wins — clamped into range and sorted by line. Diagnostics with no line are
 * dropped, since there is nothing to mark.
 */
export function markerSpecs(diagnostics: Diagnostic[], lineCount: number): LineMarker[] {
  const worst = new Map<number, Severity>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.line === null) {
      continue;
    }
    const line = clampLine(diagnostic.line, lineCount);
    const current = worst.get(line);
    if (current === undefined || severityRank(diagnostic.severity) > severityRank(current)) {
      worst.set(line, diagnostic.severity);
    }
  }
  return [...worst.entries()]
    .map(([line, severity]) => ({ line, severity }))
    .sort((a, b) => a.line - b.line);
}

/** A gutter dot marking the worst-severity diagnostic on a line. */
class DiagnosticMarker extends GutterMarker {
  constructor(readonly severity: Severity) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return other instanceof DiagnosticMarker && other.severity === this.severity;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement('span');
    dot.className = `cm-diag-marker cm-diag-${this.severity}`;
    dot.textContent = '●';
    return dot;
  }
}

/** Build a gutter marker for `severity` (exposed for direct testing). */
export function diagnosticMarker(severity: Severity): GutterMarker {
  return new DiagnosticMarker(severity);
}

/** Effect that replaces the diagnostics gutter's marker set. */
export const setDiagnosticsEffect = StateEffect.define<RangeSet<GutterMarker>>();

/** Editor state holding the diagnostics gutter markers, remapped across edits. */
export const diagnosticsField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(value, transaction) {
    let markers = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setDiagnosticsEffect)) {
        markers = effect.value;
      }
    }
    return markers;
  }
});

/** The diagnostics gutter's current markers — the field's value for `view`. */
export function diagnosticGutterMarkers(view: EditorView): RangeSet<GutterMarker> {
  return view.state.field(diagnosticsField);
}

/** Build the gutter marker set for `diagnostics` over `view`'s document. */
function buildMarkerSet(view: EditorView, diagnostics: Diagnostic[]): RangeSet<GutterMarker> {
  const doc = view.state.doc;
  const ranges = markerSpecs(diagnostics, doc.lines).map((spec) =>
    diagnosticMarker(spec.severity).range(doc.line(spec.line).from)
  );
  return RangeSet.of(ranges, true);
}

/** Move the cursor to `line` (clamped into range) and scroll it into view. */
function revealLine(view: EditorView, line: number): void {
  const target = clampLine(line, view.state.doc.lines);
  const pos = view.state.doc.line(target).from;
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
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
    diagnosticsField,
    gutter({ class: 'cm-diag-gutter', markers: diagnosticGutterMarkers }),
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

/** A request to reveal a source line, stamped so the same line can re-fire. */
export interface RevealRequest {
  /** 1-based source line to jump to. */
  line: number;
  /** A monotonic stamp; a new value triggers a fresh jump. */
  nonce: number;
}

/** A live editor: the document can be replaced, and the editor torn down. */
export interface LatexEditor {
  /** Replace the document text (a no-op when it already matches). */
  setDoc(value: string): void;
  /** Replace the gutter diagnostics shown beside the source. */
  setDiagnostics(diagnostics: Diagnostic[]): void;
  /** Move the cursor to a 1-based line (clamped) and scroll it into view. */
  gotoLine(line: number): void;
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
    setDiagnostics(diagnostics) {
      view.dispatch({ effects: setDiagnosticsEffect.of(buildMarkerSet(view, diagnostics)) });
    },
    gotoLine(line) {
      revealLine(view, line);
    },
    destroy() {
      view.destroy();
    }
  };
};
