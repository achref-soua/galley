//! Export formats and helpers for the export & interop feature.
//!
//! All types here are pure (no I/O) so they are trivially testable at 100%
//! coverage. The actual file-writing and process-spawning live in the Tauri
//! shell (excluded from coverage) and in the I/O adapters.

/// The set of export targets Galley offers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    /// The compiled PDF document.
    Pdf,
    /// A clean source ZIP with `.galley/` stripped — ready for Overleaf.
    SourceBundle,
    /// A read-only share bundle: source + compiled PDF in one ZIP.
    ShareBundle,
    /// HTML rendered via Pandoc (`pandoc --to html5`).
    Html,
    /// Microsoft Word document rendered via Pandoc (`pandoc --to docx`).
    Word,
    /// Markdown rendered via Pandoc (`pandoc --to markdown`).
    Markdown,
}

impl ExportFormat {
    /// Human-readable display label shown in the UI.
    pub fn label(self) -> &'static str {
        match self {
            ExportFormat::Pdf => "PDF",
            ExportFormat::SourceBundle => "Source Bundle (.zip)",
            ExportFormat::ShareBundle => "Share Bundle (.zip)",
            ExportFormat::Html => "HTML (via Pandoc)",
            ExportFormat::Word => "Word Document (via Pandoc)",
            ExportFormat::Markdown => "Markdown (via Pandoc)",
        }
    }

    /// The file extension (without leading dot) for the exported artifact.
    pub fn file_extension(self) -> &'static str {
        match self {
            ExportFormat::Pdf => "pdf",
            ExportFormat::SourceBundle => "zip",
            ExportFormat::ShareBundle => "zip",
            ExportFormat::Html => "html",
            ExportFormat::Word => "docx",
            ExportFormat::Markdown => "md",
        }
    }

    /// A sensible default filename for a "save as" dialog, based on the
    /// project's name.
    pub fn default_filename(self, project_name: &str) -> String {
        format!("{}.{}", project_name, self.file_extension())
    }

    /// The Pandoc `--to` format string, or `None` for non-Pandoc formats.
    pub fn pandoc_format(self) -> Option<&'static str> {
        match self {
            ExportFormat::Html => Some("html5"),
            ExportFormat::Word => Some("docx"),
            ExportFormat::Markdown => Some("markdown"),
            _ => None,
        }
    }

    /// Whether this format requires Pandoc to produce output.
    pub fn requires_pandoc(self) -> bool {
        self.pandoc_format().is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: &[ExportFormat] = &[
        ExportFormat::Pdf,
        ExportFormat::SourceBundle,
        ExportFormat::ShareBundle,
        ExportFormat::Html,
        ExportFormat::Word,
        ExportFormat::Markdown,
    ];

    #[test]
    fn every_format_has_a_non_empty_label() {
        for fmt in ALL {
            assert!(!fmt.label().is_empty(), "{fmt:?}");
        }
    }

    #[test]
    fn every_format_has_a_non_empty_extension() {
        for fmt in ALL {
            assert!(!fmt.file_extension().is_empty(), "{fmt:?}");
            assert!(!fmt.file_extension().starts_with('.'), "{fmt:?}");
        }
    }

    #[test]
    fn default_filename_incorporates_project_name_and_extension() {
        for fmt in ALL {
            let name = fmt.default_filename("my-paper");
            assert!(name.starts_with("my-paper."), "{fmt:?}: {name}");
            assert!(name.ends_with(fmt.file_extension()), "{fmt:?}: {name}");
        }
    }

    #[test]
    fn pandoc_formats_return_a_target_string() {
        assert_eq!(ExportFormat::Html.pandoc_format(), Some("html5"));
        assert_eq!(ExportFormat::Word.pandoc_format(), Some("docx"));
        assert_eq!(ExportFormat::Markdown.pandoc_format(), Some("markdown"));
    }

    #[test]
    fn non_pandoc_formats_return_none() {
        assert_eq!(ExportFormat::Pdf.pandoc_format(), None);
        assert_eq!(ExportFormat::SourceBundle.pandoc_format(), None);
        assert_eq!(ExportFormat::ShareBundle.pandoc_format(), None);
    }

    #[test]
    fn requires_pandoc_matches_pandoc_format() {
        for fmt in ALL {
            assert_eq!(
                fmt.requires_pandoc(),
                fmt.pandoc_format().is_some(),
                "{fmt:?}"
            );
        }
    }

    #[test]
    fn known_extensions() {
        assert_eq!(ExportFormat::Pdf.file_extension(), "pdf");
        assert_eq!(ExportFormat::SourceBundle.file_extension(), "zip");
        assert_eq!(ExportFormat::ShareBundle.file_extension(), "zip");
        assert_eq!(ExportFormat::Html.file_extension(), "html");
        assert_eq!(ExportFormat::Word.file_extension(), "docx");
        assert_eq!(ExportFormat::Markdown.file_extension(), "md");
    }

    #[test]
    fn debug_and_clone() {
        for fmt in ALL {
            let cloned = *fmt;
            assert_eq!(cloned, *fmt);
            assert!(!format!("{fmt:?}").is_empty());
        }
    }

    #[test]
    fn known_labels() {
        assert!(ExportFormat::Pdf.label().contains("PDF"));
        assert!(ExportFormat::SourceBundle.label().contains("zip"));
        assert!(ExportFormat::ShareBundle.label().contains("zip"));
        assert!(ExportFormat::Html.label().contains("Pandoc"));
        assert!(ExportFormat::Word.label().contains("Pandoc"));
        assert!(ExportFormat::Markdown.label().contains("Pandoc"));
    }
}
