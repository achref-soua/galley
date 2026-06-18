//! Manual integration tests for the live TexLab client.
//!
//! These need the `real-lsp` feature and a `texlab` on `PATH`. They are
//! `#[ignore]`d so the normal suite and the coverage gate never depend on a
//! language server. Run them by hand:
//!
//! ```text
//! cargo install --locked texlab          # once, if not already installed
//! just lsp-itest                          # cargo test -p galley-intel --features real-lsp -- --ignored
//! ```
//!
//! Without the feature this file compiles to an empty (but documented) test
//! crate, so it never pulls the client into the default build or coverage run.

#[cfg(feature = "real-lsp")]
mod real {
    use galley_core::{CompletionKind, LanguageIntelligence, Position, SymbolKind, TextDocument};
    use galley_intel::TexLabClient;
    use std::fs;
    use std::path::PathBuf;

    const MAIN: &str = "\\documentclass{article}\n\
\\begin{document}\n\
\\input{sections/extra}\n\
See \\ref{sec:extra}.\n\
\\end{document}\n";

    const EXTRA: &str = "\\section{Extra}\\label{sec:extra}\n\
Body of the extra section.\n";

    /// A throwaway two-file project on disk, so TexLab can index across files.
    struct Project {
        dir: tempfile::TempDir,
    }

    impl Project {
        fn new() -> Self {
            let dir = tempfile::tempdir().expect("temp project dir");
            fs::create_dir_all(dir.path().join("sections")).unwrap();
            fs::write(dir.path().join("main.tex"), MAIN).unwrap();
            fs::write(dir.path().join("sections/extra.tex"), EXTRA).unwrap();
            Self { dir }
        }

        fn main_uri(&self) -> String {
            format!("file://{}/main.tex", self.dir.path().display())
        }

        fn main_doc(&self) -> TextDocument {
            TextDocument::new(self.main_uri(), MAIN)
        }

        fn path(&self) -> PathBuf {
            self.dir.path().to_path_buf()
        }
    }

    fn client(project: &Project) -> TexLabClient {
        TexLabClient::start(&project.path()).expect("texlab should start (is it on PATH?)")
    }

    #[test]
    #[ignore = "needs texlab on PATH; run manually"]
    fn completes_commands_at_the_cursor() {
        let project = Project::new();
        let mut intel = client(&project);
        // Just after the backslash of `\input` on line 2 (zero-based).
        let items = intel.completion(&project.main_doc(), Position::new(2, 3));
        assert!(!items.is_empty(), "expected command completions");
        assert!(
            items
                .iter()
                .any(|item| item.kind == CompletionKind::Command),
            "expected at least one command candidate"
        );
    }

    #[test]
    #[ignore = "needs texlab on PATH; run manually"]
    fn completes_a_cross_file_reference_key() {
        let project = Project::new();
        let mut intel = client(&project);
        // Inside `\ref{` on line 3 — the label lives in sections/extra.tex.
        let items = intel.completion(&project.main_doc(), Position::new(3, 9));
        let reference = items
            .iter()
            .find(|item| item.kind == CompletionKind::Reference)
            .expect("a cross-file \\ref completion");
        assert_eq!(reference.label, "sec:extra");
    }

    #[test]
    #[ignore = "needs texlab on PATH; run manually"]
    fn go_to_definition_jumps_across_files() {
        let project = Project::new();
        let mut intel = client(&project);
        // On the `\ref{sec:extra}` key — its definition is in the other file.
        let location = intel
            .definition(&project.main_doc(), Position::new(3, 10))
            .expect("a definition for the reference");
        assert!(
            location.file.ends_with("sections/extra.tex"),
            "definition should resolve across files, got {}",
            location.file
        );
        // The label is defined on the first line of extra.tex (zero-based 0).
        assert_eq!(location.position.line, 0);
    }

    #[test]
    #[ignore = "needs texlab on PATH; run manually"]
    fn lists_document_symbols() {
        let project = Project::new();
        let mut intel = client(&project);
        let symbols = intel.symbols(&project.main_doc());
        // Sectioning only appears via the included file's content; the main file
        // itself has no top-level sections, so assert the call works and, when
        // present, sections classify correctly.
        for symbol in &symbols {
            assert!(matches!(
                symbol.kind,
                SymbolKind::Section | SymbolKind::Environment | SymbolKind::Other
            ));
        }
    }

    #[test]
    #[ignore = "needs texlab on PATH; run manually"]
    fn diagnostics_round_trips_without_error() {
        let project = Project::new();
        let mut intel = client(&project);
        // Without ChkTeX installed the list may be empty; the point is the LSP
        // diagnostics path runs end to end and merges into the Diagnostic shape.
        let _diagnostics = intel.diagnostics(&project.main_doc());
    }
}
