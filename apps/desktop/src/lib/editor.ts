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

import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  RangeSet,
  type Extension,
  type Text
} from '@codemirror/state';
import {
  EditorView,
  GutterMarker,
  gutter,
  hoverTooltip,
  keymap,
  lineNumbers,
  highlightActiveLine,
  type Tooltip
} from '@codemirror/view';
import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete';
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
import { vim } from '@replit/codemirror-vim';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { tags } from '@lezer/highlight';
import { type Diagnostic, type Severity, severityRank } from './diagnostics';
import {
  type CompletionItem,
  type CompletionKind,
  type DefinitionLocation,
  type LanguageBackend
} from './language-backend';
import { type KeymapMode } from './keymap-prefs';
import { type SpellChecker, makeSpellLinter } from './spell-check';

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

/**
 * The editor's bridge to the language server: which document is open, the backend
 * to ask, and what to do when a definition resolves. The editor speaks LSP's
 * zero-based positions; conversion to Galley's one-based lines happens in the UI.
 */
export interface LanguageContext {
  /** The language server backend. */
  backend: LanguageBackend;
  /** The open document's project root and relative path, or `null` when none. */
  document(): { root: string; rel: string } | null;
  /** Called with a resolved definition target so the UI can navigate to it. */
  onDefinition(location: DefinitionLocation): void;
}

/** Whether `char` is part of a LaTeX command name or reference/citation key. */
function isWordChar(char: string): boolean {
  return /[\w@:.\-!]/.test(char);
}

/**
 * The offset where the token under completion begins: scan back over command/key
 * characters from `pos`. This is where an accepted completion replaces from.
 */
export function completionStart(text: string, pos: number): number {
  let from = pos;
  while (from > 0 && isWordChar(text[from - 1])) {
    from -= 1;
  }
  return from;
}

/** Convert a document offset to a zero-based LSP position. */
export function offsetToPosition(doc: Text, offset: number): { line: number; character: number } {
  const line = doc.lineAt(offset);
  return { line: line.number - 1, character: offset - line.from };
}

/** The CodeMirror completion `type` (its icon) for a Galley completion kind. */
export function completionType(kind: CompletionKind): string {
  switch (kind) {
    case 'command':
      return 'function';
    case 'environment':
      return 'class';
    case 'package':
      return 'namespace';
    case 'class':
      return 'type';
    case 'reference':
      return 'variable';
    case 'citation':
      return 'variable';
    case 'file':
      return 'text';
    case 'folder':
      return 'text';
    case 'snippet':
      return 'keyword';
    case 'other':
      return 'text';
  }
}

/** Map language-server completion items to CodeMirror completions. */
export function toCmCompletions(items: CompletionItem[]): Completion[] {
  return items.map((item) => ({
    label: item.label,
    detail: item.detail ?? undefined,
    info: item.documentation ?? undefined,
    type: completionType(item.kind),
    apply: item.insertText ?? item.label
  }));
}

/** A CodeMirror completion source backed by the language server. */
export function latexCompletionSource(
  context: LanguageContext
): (cc: CompletionContext) => Promise<CompletionResult | null> {
  return async (cc) => {
    const target = context.document();
    if (target === null) {
      return null;
    }
    const source = cc.state.doc.toString();
    const from = completionStart(source, cc.pos);
    // With nothing typed and no explicit request, do not pop up unprompted.
    if (from === cc.pos && !cc.explicit) {
      return null;
    }
    const position = offsetToPosition(cc.state.doc, cc.pos);
    const items = await context.backend.completion(
      target.root,
      target.rel,
      source,
      position.line,
      position.character
    );
    if (items.length === 0) {
      return null;
    }
    return { from, options: toCmCompletions(items) };
  };
}

/** Build the DOM for a hover tooltip carrying `text`. */
function hoverTooltipDom(text: string): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'cm-galley-hover';
  dom.textContent = text;
  return dom;
}

/** A CodeMirror hover source backed by the language server. */
export function latexHoverSource(
  context: LanguageContext
): (view: EditorView, pos: number) => Promise<Tooltip | null> {
  return async (view, pos) => {
    const target = context.document();
    if (target === null) {
      return null;
    }
    const position = offsetToPosition(view.state.doc, pos);
    const text = await context.backend.hover(
      target.root,
      target.rel,
      view.state.doc.toString(),
      position.line,
      position.character
    );
    if (text === null || text === '') {
      return null;
    }
    return { pos, above: true, create: () => ({ dom: hoverTooltipDom(text) }) };
  };
}

/** Resolve and navigate to the definition at the cursor; returns whether it ran. */
export async function goToDefinitionAt(
  view: EditorView,
  context: LanguageContext
): Promise<boolean> {
  const target = context.document();
  if (target === null) {
    return false;
  }
  const position = offsetToPosition(view.state.doc, view.state.selection.main.head);
  const location = await context.backend.definition(
    target.root,
    target.rel,
    view.state.doc.toString(),
    position.line,
    position.character
  );
  if (location === null) {
    return false;
  }
  context.onDefinition(location);
  return true;
}

/** A keymap command that triggers go-to-definition (fire-and-forget, always handled). */
export function goToDefinitionCommand(context: LanguageContext): (view: EditorView) => boolean {
  return (view) => {
    void goToDefinitionAt(view, context);
    return true;
  };
}

/** The language-server extensions: completion, hovers, and go-to-definition. */
function languageExtensions(context: LanguageContext): Extension {
  return [
    autocompletion({ override: [latexCompletionSource(context), latexSnippetSource] }),
    hoverTooltip(latexHoverSource(context)),
    keymap.of([{ key: 'F12', run: goToDefinitionCommand(context) }])
  ];
}

/**
 * Built-in LaTeX snippets — common structural patterns triggered via Tab after
 * the prefix. These supplement the language-server completions and are always
 * available (no LSP required). Exported for direct testing.
 */
export const LATEX_SNIPPETS: Completion[] = [
  snippetCompletion('\\begin{${env}}\n\t${}\n\\end{${env}}', {
    label: '\\begin{}…\\end{}',
    type: 'keyword',
    boost: 5
  }),
  snippetCompletion('\\frac{${num}}{${den}}', {
    label: '\\frac{}{}',
    type: 'function',
    boost: 5
  }),
  snippetCompletion('\\sqrt{${expr}}', { label: '\\sqrt{}', type: 'function', boost: 4 }),
  snippetCompletion('\\textbf{${text}}', { label: '\\textbf{}', type: 'keyword', boost: 4 }),
  snippetCompletion('\\textit{${text}}', { label: '\\textit{}', type: 'keyword', boost: 4 }),
  snippetCompletion('\\emph{${text}}', { label: '\\emph{}', type: 'keyword', boost: 4 }),
  snippetCompletion('\\begin{equation}\n\t${}\n\\end{equation}', {
    label: '\\begin{equation}',
    type: 'keyword',
    boost: 3
  }),
  snippetCompletion(
    '\\begin{figure}[${htbp}]\n\t\\centering\n\t\\includegraphics[width=\\linewidth]{${file}}\n\t\\caption{${caption}}\n\t\\label{fig:${label}}\n\\end{figure}',
    { label: '\\begin{figure}', type: 'keyword', boost: 3 }
  ),
  snippetCompletion(
    '\\begin{table}[${htbp}]\n\t\\centering\n\t\\begin{tabular}{${cols}}\n\t\t${}\n\t\\end{tabular}\n\t\\caption{${caption}}\n\t\\label{tab:${label}}\n\\end{table}',
    { label: '\\begin{table}', type: 'keyword', boost: 3 }
  ),
  snippetCompletion('\\section{${title}}', { label: '\\section{}', type: 'function', boost: 4 }),
  snippetCompletion('\\subsection{${title}}', {
    label: '\\subsection{}',
    type: 'function',
    boost: 3
  }),
  snippetCompletion('\\cite{${key}}', { label: '\\cite{}', type: 'variable', boost: 4 }),
  snippetCompletion('\\ref{${label}}', { label: '\\ref{}', type: 'variable', boost: 4 }),
  snippetCompletion('\\label{${name}}', { label: '\\label{}', type: 'variable', boost: 3 })
];

/** Snippet-only completion source (used when no language context is available). */
export function latexSnippetSource(cc: CompletionContext): CompletionResult | null {
  const source = cc.state.doc.toString();
  const from = completionStart(source, cc.pos);
  if (from === cc.pos && !cc.explicit) {
    return null;
  }
  return { from, options: LATEX_SNIPPETS };
}

/**
 * Return the CM6 keymap extension for `mode`.
 * Exported so mode-selection logic can be tested without an editor.
 */
export function keymapExtension(mode: KeymapMode): Extension {
  if (mode === 'vim') {
    return vim();
  }
  return keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]);
}

/** The full extension set for a Galley LaTeX editor, reporting edits to `onChange`. */
function latexExtensions(
  onChange: (value: string) => void,
  language: LanguageContext | undefined,
  keymapMode: KeymapMode,
  spellChecker: SpellChecker | null,
  keymapCompartment: Compartment,
  spellCompartment: Compartment
): Extension {
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
    ...(language
      ? [languageExtensions(language)]
      : [autocompletion({ override: [latexSnippetSource] })]),
    keymapCompartment.of(keymapExtension(keymapMode)),
    spellCompartment.of(spellChecker !== null ? makeSpellLinter(() => spellChecker) : []),
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
  /** Language-server bridge for completion/hover/go-to-definition, if available. */
  language?: LanguageContext;
  /** The key-map mode (default, vim). */
  keymapMode?: KeymapMode;
  /** Initial spell checker, or `null` to disable spell-check. */
  spellChecker?: SpellChecker | null;
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
  /** The 1-based line the cursor is on. Used for SyncTeX forward search. */
  currentLine(): number;
  /** Switch the active key-map mode at runtime. */
  setKeymapMode(mode: KeymapMode): void;
  /** Swap the spell checker; pass `null` to disable spell-check. */
  setSpellChecker(checker: SpellChecker | null): void;
  /** Tear the editor down and release its DOM. */
  destroy(): void;
}

/** Builds an editor; the seam that lets tests substitute a fake. */
export type EditorFactory = (options: LatexEditorOptions) => LatexEditor;

/** The real CodeMirror 6 editor factory. */
export const createLatexEditor: EditorFactory = ({
  parent,
  doc,
  onChange,
  language,
  keymapMode = 'default',
  spellChecker = null
}) => {
  const keymapCompartment = new Compartment();
  const spellCompartment = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: latexExtensions(
        onChange,
        language,
        keymapMode,
        spellChecker,
        keymapCompartment,
        spellCompartment
      )
    })
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
    currentLine() {
      return view.state.doc.lineAt(view.state.selection.main.head).number;
    },
    setKeymapMode(mode) {
      view.dispatch({ effects: keymapCompartment.reconfigure(keymapExtension(mode)) });
    },
    setSpellChecker(checker) {
      const ext = checker !== null ? makeSpellLinter(() => checker) : [];
      view.dispatch({ effects: spellCompartment.reconfigure(ext) });
    },
    destroy() {
      view.destroy();
    }
  };
};
