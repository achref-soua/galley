/**
 * The seam between the editor and the LaTeX language server (TexLab).
 *
 * Completion, hovers, go-to-definition, document symbols, and live diagnostics
 * all flow through a {@link LanguageBackend}. In the packaged app it forwards to
 * the Rust command layer (which drives a real TexLab process); in a plain browser
 * and in tests an in-memory backend stands in, so the whole editor experience is
 * exercised without a language server — the same pattern as the project backend.
 *
 * All the protocol/mapping decisions live in `galley-core`/`galley-intel` (pure,
 * fixture-tested Rust); this module only carries the typed results across the IPC
 * boundary and holds the small, covered helpers the editor needs (position-free
 * URI resolution for go-to-definition).
 */

import { invoke } from '@tauri-apps/api/core';
import { type Diagnostic } from './diagnostics';
import { type ProjectSnapshot, isTauri } from './project-backend';

/** What a completion candidate represents — mirrors `galley_core::CompletionKind`. */
export type CompletionKind =
  | 'command'
  | 'environment'
  | 'package'
  | 'class'
  | 'reference'
  | 'citation'
  | 'file'
  | 'folder'
  | 'snippet'
  | 'other';

/** A completion candidate offered at the cursor. */
export interface CompletionItem {
  /** The text shown in the list. */
  label: string;
  /** What the candidate represents. */
  kind: CompletionKind;
  /** A short type/scope hint, or `null`. */
  detail: string | null;
  /** The text to insert when it differs from the label, or `null`. */
  insertText: string | null;
  /** Longer documentation, or `null`. */
  documentation: string | null;
}

/** A go-to-definition target (zero-based position). */
export interface DefinitionLocation {
  /** The target file (a `file:` URI or a project path). */
  file: string;
  /** Zero-based line. */
  line: number;
  /** Zero-based character. */
  character: number;
}

/** What a document symbol represents — mirrors `galley_core::SymbolKind`. */
export type SymbolKind = 'section' | 'environment' | 'label' | 'other';

/** A node in the document outline (zero-based line). */
export interface DocumentSymbol {
  /** The display name. */
  name: string;
  /** A short detail (e.g. the label), or `null`. */
  detail: string | null;
  /** What the symbol represents. */
  kind: SymbolKind;
  /** Zero-based source line where the symbol begins. */
  line: number;
  /** Nested symbols, in document order. */
  children: DocumentSymbol[];
}

/** The operations the editor needs from a language server. */
export interface LanguageBackend {
  /** Completion candidates at a zero-based position. */
  completion(
    root: string,
    rel: string,
    source: string,
    line: number,
    character: number
  ): Promise<CompletionItem[]>;
  /** Hover help text at a zero-based position, or `null`. */
  hover(
    root: string,
    rel: string,
    source: string,
    line: number,
    character: number
  ): Promise<string | null>;
  /** The definition a symbol resolves to, or `null`. */
  definition(
    root: string,
    rel: string,
    source: string,
    line: number,
    character: number
  ): Promise<DefinitionLocation | null>;
  /** The document's outline of structural symbols. */
  symbols(root: string, rel: string, source: string): Promise<DocumentSymbol[]>;
  /** Live diagnostics (ChkTeX/analysis) for the document. */
  diagnostics(root: string, rel: string, source: string): Promise<Diagnostic[]>;
}

/** A completion item as serialized by the Rust command layer (snake_case). */
interface RawCompletionItem {
  label: string;
  kind: CompletionKind;
  detail: string | null;
  insert_text: string | null;
  documentation: string | null;
}

/** A document symbol as serialized by the Rust command layer. */
interface RawSymbol {
  name: string;
  detail: string | null;
  kind: SymbolKind;
  line: number;
  children: RawSymbol[];
}

function fromRawCompletion(raw: RawCompletionItem): CompletionItem {
  return {
    label: raw.label,
    kind: raw.kind,
    detail: raw.detail,
    insertText: raw.insert_text,
    documentation: raw.documentation
  };
}

function fromRawSymbol(raw: RawSymbol): DocumentSymbol {
  return {
    name: raw.name,
    detail: raw.detail,
    kind: raw.kind,
    line: raw.line,
    children: raw.children.map(fromRawSymbol)
  };
}

/** The backend backed by the Tauri command layer (drives a real TexLab). */
export function tauriLanguageBackend(): LanguageBackend {
  return {
    async completion(root, rel, source, line, character) {
      const raw = await invoke<RawCompletionItem[]>('lsp_completion', {
        root,
        rel,
        source,
        line,
        character
      });
      return raw.map(fromRawCompletion);
    },
    hover(root, rel, source, line, character) {
      return invoke<string | null>('lsp_hover', { root, rel, source, line, character });
    },
    definition(root, rel, source, line, character) {
      return invoke<DefinitionLocation | null>('lsp_definition', {
        root,
        rel,
        source,
        line,
        character
      });
    },
    async symbols(root, rel, source) {
      const raw = await invoke<RawSymbol[]>('lsp_symbols', { root, rel, source });
      return raw.map(fromRawSymbol);
    },
    diagnostics(root, rel, source) {
      return invoke<Diagnostic[]>('lsp_diagnostics', { root, rel, source });
    }
  };
}

/** A small, fixed set of common LaTeX command completions for the demo backend. */
function demoCommand(label: string, detail: string): CompletionItem {
  return { label, kind: 'command', detail, insertText: null, documentation: null };
}

const DEMO_COMPLETIONS: CompletionItem[] = [
  demoCommand('section', 'Start a section'),
  demoCommand('subsection', 'Start a subsection'),
  demoCommand('textbf', 'Bold text'),
  demoCommand('emph', 'Emphasised text'),
  demoCommand('begin', 'Open an environment'),
  { label: 'item', kind: 'snippet', detail: 'List item', insertText: 'item ', documentation: null }
];

/**
 * An in-memory backend for the browser, dev, and tests: deterministic completion,
 * hover, definition, and symbols so the editor's language features can be driven
 * without a TeX language server. The packaged app talks to a real TexLab.
 */
export function browserLanguageBackend(): LanguageBackend {
  return {
    async completion() {
      return DEMO_COMPLETIONS;
    },
    async hover() {
      return 'A LaTeX command.';
    },
    async definition() {
      // Resolves to the top of the current demo file.
      return { file: 'main.tex', line: 0, character: 0 };
    },
    async symbols() {
      return [
        { name: 'Introduction', detail: 'sec:intro', kind: 'section', line: 0, children: [] }
      ];
    },
    async diagnostics() {
      return [];
    }
  };
}

/** Pick the right language backend for the current runtime. */
export function selectLanguageBackend(win: Window = window): LanguageBackend {
  return isTauri(win) ? tauriLanguageBackend() : browserLanguageBackend();
}

/** A flattened outline row: a symbol and its nesting depth. */
export interface OutlineRow {
  /** The symbol. */
  symbol: DocumentSymbol;
  /** Zero-based nesting depth, for indentation. */
  depth: number;
}

/** Flatten a symbol tree into indented rows in document order, for the outline. */
export function flattenSymbols(symbols: DocumentSymbol[], depth = 0): OutlineRow[] {
  const rows: OutlineRow[] = [];
  for (const symbol of symbols) {
    rows.push({ symbol, depth });
    rows.push(...flattenSymbols(symbol.children, depth + 1));
  }
  return rows;
}

/** Strip a `file:` URI scheme to a filesystem path; plain paths pass through. */
export function filePathFromUri(file: string): string {
  if (file.startsWith('file://')) {
    return decodeURIComponent(file.slice('file://'.length));
  }
  return file;
}

/** A path relative to `root`, or the path unchanged when it is not under `root`. */
export function relativeToRoot(root: string, path: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Resolve a definition target to a project-relative file and line, or `null` when
 * no project is open. The path is made relative to the project root so it can be
 * opened and revealed by the editor.
 */
export function resolveDefinition(
  location: DefinitionLocation,
  project: ProjectSnapshot | null
): { rel: string; line: number } | null {
  if (project === null) {
    return null;
  }
  const path = filePathFromUri(location.file);
  return { rel: relativeToRoot(project.root, path), line: location.line };
}
