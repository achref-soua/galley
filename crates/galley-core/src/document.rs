//! Documents within a project: how Galley names, classifies, and picks them.
//!
//! Everything here is pure string logic over project-relative, forward-slashed
//! paths, so it carries its coverage cheaply and never needs a filesystem.

/// What kind of file a project document is, inferred from its extension.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocumentKind {
    /// A LaTeX source file (`.tex` / `.ltx`).
    Tex,
    /// A bibliography database (`.bib`).
    Bib,
    /// An includable asset (image, figure, embedded PDF).
    Asset,
    /// Anything else.
    Other,
}

/// A single file in a project, paired with its inferred kind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Document {
    /// Project-relative, forward-slashed path.
    pub path: String,
    /// The kind inferred from the path's extension.
    pub kind: DocumentKind,
}

impl Document {
    /// Build a document from its project-relative path, classifying it.
    #[must_use]
    pub fn new(path: impl Into<String>) -> Self {
        let path = path.into();
        let kind = classify(&path);
        Self { path, kind }
    }
}

/// The last path segment (the file name).
#[must_use]
pub fn basename(path: &str) -> &str {
    match path.rfind('/') {
        Some(i) => &path[i + 1..],
        None => path,
    }
}

/// The lowercased extension of a path, if it has one.
fn extension(path: &str) -> Option<String> {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

/// Classify a path into a [`DocumentKind`] by its extension.
#[must_use]
pub fn classify(path: &str) -> DocumentKind {
    match extension(path).as_deref() {
        Some("tex" | "ltx") => DocumentKind::Tex,
        Some("bib") => DocumentKind::Bib,
        Some("png" | "jpg" | "jpeg" | "pdf" | "eps" | "svg") => DocumentKind::Asset,
        _ => DocumentKind::Other,
    }
}

/// Whether a path's file name is the conventional `main.tex` root (case-insensitive).
#[must_use]
pub fn is_main_named(path: &str) -> bool {
    basename(path).eq_ignore_ascii_case("main.tex")
}

/// Whether a file's contents look like a compilable LaTeX root document.
#[must_use]
pub fn looks_like_root(content: &str) -> bool {
    content.contains("\\documentclass") && content.contains("\\begin{document}")
}

/// A `.tex` file considered when choosing a project's root document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RootCandidate {
    /// Project-relative path of the candidate.
    pub path: String,
    /// Whether the file is named `main.tex`.
    pub is_main_named: bool,
    /// Whether the file's contents look like a root document.
    pub has_documentclass: bool,
}

impl RootCandidate {
    /// Rank a candidate: a real `\documentclass` outweighs the `main.tex` name.
    fn rank(&self) -> u8 {
        u8::from(self.has_documentclass) * 2 + u8::from(self.is_main_named)
    }
}

/// Choose the most likely root document from the candidates, preferring a real
/// `\documentclass`, then the `main.tex` name, then the first candidate. Returns
/// `None` when there are no candidates.
#[must_use]
pub fn select_root_document(candidates: &[RootCandidate]) -> Option<String> {
    let mut best: Option<&RootCandidate> = None;
    for candidate in candidates {
        if best.is_none_or(|current| candidate.rank() > current.rank()) {
            best = Some(candidate);
        }
    }
    best.map(|candidate| candidate.path.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basename_handles_nested_and_top_level() {
        assert_eq!(basename("chapters/intro.tex"), "intro.tex");
        assert_eq!(basename("main.tex"), "main.tex");
    }

    #[test]
    fn classifies_by_extension() {
        assert_eq!(classify("main.tex"), DocumentKind::Tex);
        assert_eq!(classify("paper.ltx"), DocumentKind::Tex);
        assert_eq!(classify("refs.bib"), DocumentKind::Bib);
        for asset in ["fig.png", "p.JPG", "x.jpeg", "y.pdf", "z.eps", "v.svg"] {
            assert_eq!(classify(asset), DocumentKind::Asset, "{asset}");
        }
        assert_eq!(classify("README"), DocumentKind::Other);
        assert_eq!(classify("notes.md"), DocumentKind::Other);
    }

    #[test]
    fn new_document_classifies_its_path() {
        let doc = Document::new("a/b.tex");
        assert_eq!(doc.path, "a/b.tex");
        assert_eq!(doc.kind, DocumentKind::Tex);
    }

    #[test]
    fn recognises_the_main_filename() {
        assert!(is_main_named("main.tex"));
        assert!(is_main_named("src/Main.TEX"));
        assert!(!is_main_named("intro.tex"));
    }

    #[test]
    fn detects_a_root_document_body() {
        assert!(looks_like_root(
            "\\documentclass{article}\n\\begin{document}hi\\end{document}"
        ));
        assert!(!looks_like_root("\\documentclass{article}")); // no begin
        assert!(!looks_like_root("\\begin{document}")); // no documentclass
    }

    fn candidate(path: &str, main: bool, doc: bool) -> RootCandidate {
        RootCandidate {
            path: path.to_string(),
            is_main_named: main,
            has_documentclass: doc,
        }
    }

    #[test]
    fn picks_nothing_when_empty() {
        assert_eq!(select_root_document(&[]), None);
    }

    #[test]
    fn prefers_documentclass_over_name_over_first() {
        // First candidate wins on a tie / when it is the only one.
        assert_eq!(
            select_root_document(&[candidate("a.tex", false, false)]),
            Some("a.tex".to_string())
        );
        // `main.tex` (rank 1) beats a plain earlier file (rank 0).
        assert_eq!(
            select_root_document(&[
                candidate("a.tex", false, false),
                candidate("main.tex", true, false)
            ]),
            Some("main.tex".to_string())
        );
        // A real \documentclass (rank 2) beats `main.tex` (rank 1), even later.
        assert_eq!(
            select_root_document(&[
                candidate("main.tex", true, false),
                candidate("paper.tex", false, true)
            ]),
            Some("paper.tex".to_string())
        );
        // Equal rank keeps the earlier candidate (no `>` win).
        assert_eq!(
            select_root_document(&[
                candidate("first.tex", false, true),
                candidate("second.tex", false, true)
            ]),
            Some("first.tex".to_string())
        );
    }

    #[test]
    fn kind_derives_are_usable() {
        let k = DocumentKind::Tex;
        let copied = k;
        assert_eq!(copied, k);
        assert_ne!(DocumentKind::Bib, DocumentKind::Asset);
        assert_eq!(format!("{k:?}"), "Tex");
        let candidate = candidate("a.tex", true, true);
        assert_eq!(candidate.clone(), candidate);
        assert!(format!("{candidate:?}").contains("RootCandidate"));
    }
}
