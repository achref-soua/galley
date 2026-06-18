//! Language intelligence: the [`LanguageIntelligence`] port and the pure domain
//! types it trades in.
//!
//! Galley's editor smarts — completion, hovers, go-to-definition, document
//! symbols, and live diagnostics — come from a LaTeX language server (TexLab).
//! That server speaks LSP over a child-process pipe, which is real I/O; so, as
//! with the compile engine, the heavy adapter lives behind a feature seam in
//! `galley-intel`, and *everything decidable* lives here and there as pure,
//! fully-tested code: these types, and the protocol/mapping in `galley-intel`.
//!
//! This module owns only data and the port trait. There is no engine, no
//! process, and no network, so it is exercised to full coverage with plain unit
//! tests. The adapter implements [`LanguageIntelligence`] over a live server;
//! the UI and the Tauri layer speak in these types.
//!
//! Positions follow the LSP convention — **zero-based** line and character — so
//! the mappers in `galley-intel` need no arithmetic. Galley's UI works in
//! one-based lines, so the editor converts at that single boundary (§4.2).

use crate::diagnostics::Diagnostic;

/// A zero-based position in a text document, in LSP convention: a line and a
/// character offset within that line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Position {
    /// Zero-based line.
    pub line: u32,
    /// Zero-based character offset within the line.
    pub character: u32,
}

impl Position {
    /// A position at `line`:`character` (both zero-based).
    #[must_use]
    pub const fn new(line: u32, character: u32) -> Self {
        Self { line, character }
    }
}

/// What a completion candidate represents, so the UI can show the right glyph and
/// the editor can group results.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletionKind {
    /// A control sequence, e.g. `\section`.
    Command,
    /// An environment name for `\begin{…}`/`\end{…}`.
    Environment,
    /// A package for `\usepackage{…}`.
    Package,
    /// A document class for `\documentclass{…}`.
    Class,
    /// A label key for `\ref`/`\eqref`/`\pageref`.
    Reference,
    /// A bibliography key for `\cite`.
    Citation,
    /// A file path (e.g. for `\input`/`\include`/`\includegraphics`).
    File,
    /// A directory along a file path.
    Folder,
    /// A multi-step snippet (e.g. an environment skeleton).
    Snippet,
    /// Anything else the server offered.
    Other,
}

impl CompletionKind {
    /// A short, stable kebab-case identifier for serialization and styling.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            CompletionKind::Command => "command",
            CompletionKind::Environment => "environment",
            CompletionKind::Package => "package",
            CompletionKind::Class => "class",
            CompletionKind::Reference => "reference",
            CompletionKind::Citation => "citation",
            CompletionKind::File => "file",
            CompletionKind::Folder => "folder",
            CompletionKind::Snippet => "snippet",
            CompletionKind::Other => "other",
        }
    }
}

/// A single completion candidate offered at the cursor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionItem {
    /// The text shown in the list (e.g. `section`).
    pub label: String,
    /// What the candidate represents.
    pub kind: CompletionKind,
    /// A short type/scope hint shown beside the label, when the server gives one.
    pub detail: Option<String>,
    /// The text to insert, when it differs from `label`.
    pub insert_text: Option<String>,
    /// Longer documentation, when the server gives any.
    pub documentation: Option<String>,
}

impl CompletionItem {
    /// A bare candidate `label` of `kind`, with no extra detail.
    #[must_use]
    pub fn new(label: impl Into<String>, kind: CompletionKind) -> Self {
        Self {
            label: label.into(),
            kind,
            detail: None,
            insert_text: None,
            documentation: None,
        }
    }

    /// The text the editor should insert for this candidate — its [`insert_text`]
    /// when present, otherwise its [`label`].
    ///
    /// [`insert_text`]: CompletionItem::insert_text
    /// [`label`]: CompletionItem::label
    #[must_use]
    pub fn insertion(&self) -> &str {
        match &self.insert_text {
            Some(text) => text,
            None => &self.label,
        }
    }
}

/// Hover help for the symbol under the cursor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hover {
    /// The help text (plain text or Markdown), as the server produced it.
    pub contents: String,
}

impl Hover {
    /// Hover help carrying `contents`.
    #[must_use]
    pub fn new(contents: impl Into<String>) -> Self {
        Self {
            contents: contents.into(),
        }
    }
}

/// A source location a definition resolves to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Location {
    /// The target file, as the server reported it (a `file:` URI path or a path
    /// the UI resolves against the project root).
    pub file: String,
    /// The zero-based position within that file.
    pub position: Position,
}

impl Location {
    /// A location at `position` within `file`.
    #[must_use]
    pub fn new(file: impl Into<String>, position: Position) -> Self {
        Self {
            file: file.into(),
            position,
        }
    }
}

/// What a document symbol represents in a LaTeX outline.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SymbolKind {
    /// A sectioning command (part/chapter/section/subsection/…).
    Section,
    /// An environment (figure, table, theorem, …).
    Environment,
    /// A `\label{…}` anchor.
    Label,
    /// Anything else the server reported.
    Other,
}

impl SymbolKind {
    /// A short, stable kebab-case identifier for serialization and styling.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            SymbolKind::Section => "section",
            SymbolKind::Environment => "environment",
            SymbolKind::Label => "label",
            SymbolKind::Other => "other",
        }
    }
}

/// A node in the document outline — a named structural element with a source line
/// and any nested children.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentSymbol {
    /// The display name (e.g. a section title or an environment name).
    pub name: String,
    /// A short detail shown beside the name, when the server gives one.
    pub detail: Option<String>,
    /// What the symbol represents.
    pub kind: SymbolKind,
    /// The zero-based source line where the symbol begins.
    pub line: u32,
    /// Nested symbols, in document order.
    pub children: Vec<DocumentSymbol>,
}

impl DocumentSymbol {
    /// A leaf symbol named `name` of `kind` beginning at zero-based `line`.
    #[must_use]
    pub fn new(name: impl Into<String>, kind: SymbolKind, line: u32) -> Self {
        Self {
            name: name.into(),
            detail: None,
            kind,
            line,
            children: Vec::new(),
        }
    }

    /// The total number of symbols in this subtree, counting itself.
    #[must_use]
    pub fn count(&self) -> usize {
        1 + self
            .children
            .iter()
            .map(DocumentSymbol::count)
            .sum::<usize>()
    }
}

/// An open text document the language server reasons about: its URI and current
/// text. The adapter keeps the server's copy in sync with this.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextDocument {
    /// The document URI (a `file:` URI in the packaged app).
    pub uri: String,
    /// The full current text.
    pub text: String,
}

impl TextDocument {
    /// An open document at `uri` holding `text`.
    #[must_use]
    pub fn new(uri: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            uri: uri.into(),
            text: text.into(),
        }
    }
}

/// The language-intelligence port (§4.2).
///
/// One adapter implements it: the TexLab client in `galley-intel`, behind the
/// `real-lsp` feature seam. Every method answers a question about the document at
/// a position; the adapter keeps the server in sync with `doc` before asking.
/// `&mut self` because a live client tracks request ids and the server's view of
/// open documents.
pub trait LanguageIntelligence {
    /// Completion candidates offered at `position` in `doc`.
    fn completion(&mut self, doc: &TextDocument, position: Position) -> Vec<CompletionItem>;

    /// Hover help for the symbol at `position` in `doc`, if any.
    fn hover(&mut self, doc: &TextDocument, position: Position) -> Option<Hover>;

    /// The definition the symbol at `position` in `doc` resolves to, if any.
    fn definition(&mut self, doc: &TextDocument, position: Position) -> Option<Location>;

    /// The document's outline of structural symbols.
    fn symbols(&mut self, doc: &TextDocument) -> Vec<DocumentSymbol>;

    /// Live diagnostics for `doc` (ChkTeX style notes and the server's own
    /// analysis), to be merged with the compile log's diagnostics.
    fn diagnostics(&mut self, doc: &TextDocument) -> Vec<Diagnostic>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::{Diagnostic, Severity};

    #[test]
    fn position_holds_zero_based_coordinates() {
        let pos = Position::new(3, 7);
        assert_eq!(pos.line, 3);
        assert_eq!(pos.character, 7);
        let copy = pos;
        assert_eq!(copy, pos);
        assert_ne!(Position::new(0, 0), pos);
        assert!(format!("{pos:?}").contains("Position"));
    }

    #[test]
    fn completion_kinds_have_stable_labels() {
        assert_eq!(CompletionKind::Command.label(), "command");
        assert_eq!(CompletionKind::Environment.label(), "environment");
        assert_eq!(CompletionKind::Package.label(), "package");
        assert_eq!(CompletionKind::Class.label(), "class");
        assert_eq!(CompletionKind::Reference.label(), "reference");
        assert_eq!(CompletionKind::Citation.label(), "citation");
        assert_eq!(CompletionKind::File.label(), "file");
        assert_eq!(CompletionKind::Folder.label(), "folder");
        assert_eq!(CompletionKind::Snippet.label(), "snippet");
        assert_eq!(CompletionKind::Other.label(), "other");
        let kind = CompletionKind::Command;
        assert_eq!(kind, kind);
        assert_ne!(CompletionKind::Command, CompletionKind::Package);
        assert!(format!("{kind:?}").contains("Command"));
    }

    #[test]
    fn completion_item_falls_back_to_label_for_insertion() {
        let bare = CompletionItem::new("section", CompletionKind::Command);
        assert_eq!(bare.label, "section");
        assert_eq!(bare.kind, CompletionKind::Command);
        assert_eq!(bare.detail, None);
        assert_eq!(bare.insert_text, None);
        assert_eq!(bare.documentation, None);
        // No insert_text → insertion is the label.
        assert_eq!(bare.insertion(), "section");

        let snippet = CompletionItem {
            insert_text: Some("section{$1}".to_string()),
            documentation: Some("Start a section".to_string()),
            detail: Some("sectioning".to_string()),
            ..CompletionItem::new("section", CompletionKind::Snippet)
        };
        // insert_text present → it wins.
        assert_eq!(snippet.insertion(), "section{$1}");
        assert_eq!(snippet.detail.as_deref(), Some("sectioning"));
        assert_eq!(snippet.clone(), snippet);
        assert!(format!("{snippet:?}").contains("CompletionItem"));
    }

    #[test]
    fn hover_carries_its_contents() {
        let hover = Hover::new("\\section{title}");
        assert_eq!(hover.contents, "\\section{title}");
        assert_eq!(hover.clone(), hover);
        assert_ne!(Hover::new("other"), hover);
        assert!(format!("{hover:?}").contains("Hover"));
    }

    #[test]
    fn location_pairs_a_file_with_a_position() {
        let loc = Location::new("chapters/intro.tex", Position::new(12, 0));
        assert_eq!(loc.file, "chapters/intro.tex");
        assert_eq!(loc.position, Position::new(12, 0));
        assert_eq!(loc.clone(), loc);
        assert_ne!(Location::new("other.tex", Position::new(0, 0)), loc);
        assert!(format!("{loc:?}").contains("Location"));
    }

    #[test]
    fn symbol_kinds_have_stable_labels() {
        assert_eq!(SymbolKind::Section.label(), "section");
        assert_eq!(SymbolKind::Environment.label(), "environment");
        assert_eq!(SymbolKind::Label.label(), "label");
        assert_eq!(SymbolKind::Other.label(), "other");
        let kind = SymbolKind::Section;
        assert_eq!(kind, kind);
        assert_ne!(SymbolKind::Section, SymbolKind::Label);
        assert!(format!("{kind:?}").contains("Section"));
    }

    #[test]
    fn document_symbol_counts_its_subtree() {
        let leaf = DocumentSymbol::new("Introduction", SymbolKind::Section, 4);
        assert_eq!(leaf.name, "Introduction");
        assert_eq!(leaf.kind, SymbolKind::Section);
        assert_eq!(leaf.line, 4);
        assert_eq!(leaf.detail, None);
        assert!(leaf.children.is_empty());
        assert_eq!(leaf.count(), 1);

        let tree = DocumentSymbol {
            detail: Some("\\section".to_string()),
            children: vec![
                DocumentSymbol::new("Background", SymbolKind::Section, 6),
                DocumentSymbol {
                    children: vec![DocumentSymbol::new("fig:plot", SymbolKind::Label, 9)],
                    ..DocumentSymbol::new("figure", SymbolKind::Environment, 8)
                },
            ],
            ..DocumentSymbol::new("Introduction", SymbolKind::Section, 4)
        };
        // 1 (root) + 1 (Background) + 1 (figure) + 1 (label) = 4.
        assert_eq!(tree.count(), 4);
        assert_eq!(tree.detail.as_deref(), Some("\\section"));
        assert_eq!(tree.clone(), tree);
        assert!(format!("{tree:?}").contains("DocumentSymbol"));
    }

    #[test]
    fn text_document_holds_uri_and_text() {
        let doc = TextDocument::new("file:///main.tex", "\\documentclass{article}");
        assert_eq!(doc.uri, "file:///main.tex");
        assert_eq!(doc.text, "\\documentclass{article}");
        assert_eq!(doc.clone(), doc);
        assert_ne!(TextDocument::new("file:///other.tex", ""), doc);
        assert!(format!("{doc:?}").contains("TextDocument"));
    }

    /// A tiny in-memory implementor proves the port is object-safe in spirit and
    /// usable; the real adapter (TexLab) lives behind `real-lsp` in `galley-intel`.
    struct StubIntel;
    impl LanguageIntelligence for StubIntel {
        fn completion(&mut self, _doc: &TextDocument, _position: Position) -> Vec<CompletionItem> {
            vec![CompletionItem::new("section", CompletionKind::Command)]
        }
        fn hover(&mut self, _doc: &TextDocument, _position: Position) -> Option<Hover> {
            Some(Hover::new("help"))
        }
        fn definition(&mut self, _doc: &TextDocument, _position: Position) -> Option<Location> {
            Some(Location::new("main.tex", Position::new(0, 0)))
        }
        fn symbols(&mut self, _doc: &TextDocument) -> Vec<DocumentSymbol> {
            vec![DocumentSymbol::new("Intro", SymbolKind::Section, 0)]
        }
        fn diagnostics(&mut self, _doc: &TextDocument) -> Vec<Diagnostic> {
            vec![Diagnostic::lint(
                Severity::Warning,
                "Command terminated with space.".to_string(),
                None,
                Some(2),
            )]
        }
    }

    #[test]
    fn the_port_can_be_implemented_and_driven() {
        let mut intel = StubIntel;
        let doc = TextDocument::new("file:///main.tex", "\\section{x}");
        let pos = Position::new(0, 1);
        assert_eq!(intel.completion(&doc, pos).len(), 1);
        assert_eq!(intel.hover(&doc, pos).unwrap().contents, "help");
        assert_eq!(intel.definition(&doc, pos).unwrap().file, "main.tex");
        assert_eq!(intel.symbols(&doc).len(), 1);
        let diags = intel.diagnostics(&doc);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].severity, Severity::Warning);
    }
}
