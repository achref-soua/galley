//! Parse-only project analysis for the migration & import pipeline.
//!
//! All functions here are **pure and I/O-free**: they accept already-read file
//! content and return structured metadata without touching the filesystem,
//! executing any scripts, or making network requests.  This keeps the module
//! 100 % unit-testable and means a hostile project cannot exploit the import
//! path — particularly, `latexmkrc` is inspected via plain string search, never
//! executed. (Architecture: §4.7; ADR-0024.)

use crate::document::{is_main_named, looks_like_root, select_root_document, RootCandidate};

// ── File entry ─────────────────────────────────────────────────────────────

/// A file from any import source (folder, zip, tarball, git).
///
/// Paths are always project-relative and use forward-slash separators,
/// matching the [`crate::SafeRoot`] convention.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEntry {
    /// Project-relative path (e.g. `"sections/intro.tex"`).
    pub path: String,
    /// Raw file content (may be binary for assets).
    pub content: Vec<u8>,
}

impl FileEntry {
    /// Build a new entry from a path and owned bytes.
    #[must_use]
    pub fn new(path: impl Into<String>, content: Vec<u8>) -> Self {
        Self {
            path: path.into(),
            content,
        }
    }

    /// Interpret the content as a UTF-8 string, returning `None` for binary
    /// files that are not valid UTF-8.
    #[must_use]
    pub fn as_text(&self) -> Option<&str> {
        std::str::from_utf8(&self.content).ok()
    }
}

// ── Engine ─────────────────────────────────────────────────────────────────

/// The LaTeX engine detected or chosen for a project.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TexEngine {
    /// Galley's default embedded engine — handles the vast majority of
    /// documents and requires no external TeX installation.
    Tectonic,
    /// Full TeX Live via `latexmk` — required for XeLaTeX/LuaLaTeX, PostScript
    /// packages (`pstricks`), and anything Tectonic cannot serve.
    LatexMk,
}

impl TexEngine {
    /// Short, user-facing label.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            TexEngine::Tectonic => "Tectonic (embedded)",
            TexEngine::LatexMk => "latexmk / TeX Live",
        }
    }
}

// ── Bib tool ───────────────────────────────────────────────────────────────

/// The bibliography processor detected for a project.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BibTool {
    /// No bibliography detected.
    None,
    /// Classic BibTeX processor.
    BibTeX,
    /// Modern `biber` processor (used with `biblatex`).
    Biber,
}

impl BibTool {
    /// Short, user-facing label.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            BibTool::None => "None",
            BibTool::BibTeX => "BibTeX",
            BibTool::Biber => "Biber",
        }
    }
}

// ── Project profile ────────────────────────────────────────────────────────

/// Parse-only analysis of a LaTeX project's metadata.
///
/// Built by [`analyze_project`]; all detection is heuristic-based (we inspect
/// source text, never run any tool). Overridable by the user in the import
/// wizard before materialisation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectProfile {
    /// Detected (or inferred) root/main TeX file.
    pub root_file: String,
    /// Detected compile engine.
    pub engine: TexEngine,
    /// Detected bibliography processor.
    pub bib_tool: BibTool,
    /// Detected source encoding (e.g. `"utf8"`, `"latin1"`), or empty.
    pub encoding: String,
    /// Sorted, deduplicated list of detected LaTeX packages.
    pub packages: Vec<String>,
    /// Sorted, deduplicated list of detected font names.
    pub fonts: Vec<String>,
    /// Human-readable advisory messages (e.g. "XeLaTeX detected — latexmk
    /// is needed for full compatibility").
    pub warnings: Vec<String>,
}

// ── Public API ─────────────────────────────────────────────────────────────

/// Analyse a set of files and return a best-effort [`ProjectProfile`].
///
/// Detection is fully parse-only: no I/O, no process execution, no network.
/// A `latexmkrc` file is inspected via plain string search, never executed.
#[must_use]
pub fn analyze_project(entries: &[FileEntry]) -> ProjectProfile {
    // Gather text-decodable entries once.
    let text: Vec<(&FileEntry, &str)> = entries
        .iter()
        .filter_map(|e| e.as_text().map(|s| (e, s)))
        .collect();

    let root_file = detect_root(&text);
    let packages = detect_packages(&text);
    let fonts = detect_fonts(&text);
    let engine = detect_engine(&text, &packages);
    let bib_tool = detect_bib_tool(&packages, &text);
    let encoding = detect_encoding(&text);
    let warnings = build_warnings(engine, &text);

    ProjectProfile {
        root_file,
        engine,
        bib_tool,
        encoding,
        packages,
        fonts,
        warnings,
    }
}

/// Filter a list of project-relative paths, removing any that begin with
/// `.galley/` so that a clean export omits Galley's own metadata.
#[must_use]
pub fn clean_export_paths(paths: &[String]) -> Vec<String> {
    paths
        .iter()
        .filter(|p| !p.starts_with(".galley/") && *p != ".galley")
        .cloned()
        .collect()
}

// ── Root file detection ────────────────────────────────────────────────────

fn detect_root(text: &[(&FileEntry, &str)]) -> String {
    // Priority 1: %!TEX root hint in any .tex file.
    for (_, content) in text {
        if let Some(hint) = tex_root_hint(content) {
            return hint;
        }
    }

    // Priority 2: single .tex file containing \documentclass + \begin{document}.
    // Reuse existing root-document selection logic.
    let candidates: Vec<RootCandidate> = text
        .iter()
        .filter(|(entry, _)| entry.path.ends_with(".tex"))
        .map(|(entry, content)| RootCandidate {
            path: entry.path.clone(),
            is_main_named: is_main_named(&entry.path),
            has_documentclass: looks_like_root(content),
        })
        .collect();

    select_root_document(&candidates).unwrap_or_default()
}

/// Extract the `%!TEX root = …` or `% !TEX root = …` hint from source text.
#[must_use]
pub fn tex_root_hint(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        let rest = match trimmed
            .strip_prefix("%!TEX root")
            .or_else(|| trimmed.strip_prefix("% !TEX root"))
        {
            Some(r) => r,
            None => continue,
        };
        let hint = rest
            .trim_start_matches([' ', '=', '\t'])
            .trim_end()
            .to_string();
        if !hint.is_empty() {
            return Some(hint);
        }
    }
    None
}

// ── Engine detection ────────────────────────────────────────────────────────

fn detect_engine(text: &[(&FileEntry, &str)], packages: &[String]) -> TexEngine {
    // Priority 1: explicit %!TEX program comment.
    for (_, content) in text {
        if let Some(engine) = engine_from_program_comment(content) {
            return engine;
        }
    }

    // Priority 2: engine hint in latexmkrc.
    for (entry, content) in text {
        if is_latexmkrc(&entry.path) {
            if let Some(engine) = latexmkrc_engine(content) {
                return engine;
            }
        }
    }

    // Priority 3: package heuristics.
    if engine_needs_latexmk(packages) {
        TexEngine::LatexMk
    } else {
        TexEngine::Tectonic
    }
}

/// Parse a `%!TEX program = …` directive.
#[must_use]
pub fn engine_from_program_comment(content: &str) -> Option<TexEngine> {
    for line in content.lines() {
        let trimmed = line.trim();
        let rest = match trimmed
            .strip_prefix("%!TEX program")
            .or_else(|| trimmed.strip_prefix("% !TEX program"))
        {
            Some(r) => r,
            None => continue,
        };
        let prog = rest
            .trim_start_matches([' ', '=', '\t'])
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_lowercase();
        return Some(if prog.contains("xelatex") || prog.contains("lualatex") {
            TexEngine::LatexMk
        } else {
            TexEngine::Tectonic
        });
    }
    None
}

/// Check whether `path` looks like a `latexmkrc` configuration file.
#[must_use]
pub fn is_latexmkrc(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    name == "latexmkrc" || name == ".latexmkrc"
}

/// Inspect `latexmkrc` content for an engine declaration.
///
/// The file is **never executed** — this is a plain text search.
#[must_use]
pub fn latexmkrc_engine(content: &str) -> Option<TexEngine> {
    let lower = content.to_lowercase();
    if lower.contains("xelatex") || lower.contains("lualatex") {
        Some(TexEngine::LatexMk)
    } else {
        None
    }
}

/// Return `true` when the package list contains packages that require TeX
/// Live / XeLaTeX / LuaLaTeX (i.e. Tectonic cannot serve them reliably).
#[must_use]
pub fn engine_needs_latexmk(packages: &[String]) -> bool {
    const LATEXMK_PACKAGES: &[&str] = &[
        "fontspec", "xltxtra", "xunicode", "polyglossia",
        "luatexja", "luatexja-fontspec",
        "pstricks", "pst-all",
    ];
    packages
        .iter()
        .any(|p| LATEXMK_PACKAGES.contains(&p.as_str()))
}

// ── Bibliography tool detection ─────────────────────────────────────────────

fn detect_bib_tool(packages: &[String], text: &[(&FileEntry, &str)]) -> BibTool {
    if packages.iter().any(|p| p == "biblatex") {
        // Check for explicit backend=bibtex override.
        for (_, content) in text {
            for line in content.lines() {
                let trimmed = line.trim_start();
                if trimmed.contains("biblatex") && trimmed.contains("backend=bibtex") {
                    return BibTool::BibTeX;
                }
            }
        }
        return BibTool::Biber;
    }
    // Classic BibTeX: look for \bibliography{} call.
    for (_, content) in text {
        if content.contains("\\bibliography{") {
            return BibTool::BibTeX;
        }
    }
    BibTool::None
}

// ── Encoding detection ──────────────────────────────────────────────────────

fn detect_encoding(text: &[(&FileEntry, &str)]) -> String {
    for (_, content) in text {
        for line in content.lines() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("\\usepackage") && trimmed.contains("inputenc") {
                if let Some(open) = trimmed.find('[') {
                    if let Some(close) = trimmed[open..].find(']') {
                        return trimmed[open + 1..open + close].trim().to_string();
                    }
                }
            }
        }
    }
    String::new()
}

// ── Package detection ───────────────────────────────────────────────────────

/// Extract all `\usepackage{…}` names (including comma-separated lists and
/// the bracketed-option form `\usepackage[opts]{name}`).
#[must_use]
pub fn detect_packages(text: &[(&FileEntry, &str)]) -> Vec<String> {
    let mut packages: Vec<String> = Vec::new();
    for (entry, content) in text {
        if !entry.path.ends_with(".tex") {
            continue;
        }
        for line in content.lines() {
            let trimmed = line.trim_start();
            if !trimmed.starts_with("\\usepackage") {
                continue;
            }
            if let Some(names) = extract_last_braced(trimmed) {
                for name in names.split(',') {
                    let name = name.trim();
                    if !name.is_empty() {
                        packages.push(name.to_string());
                    }
                }
            }
        }
    }
    packages.sort();
    packages.dedup();
    packages
}

// ── Font detection ──────────────────────────────────────────────────────────

const FONT_COMMANDS: &[&str] = &[
    "\\setmainfont",
    "\\setsansfont",
    "\\setmonofont",
    "\\fontspec",
    "\\newfontfamily",
    "\\setmathrm",
];

/// Extract font names from XeLaTeX/LuaLaTeX font-selection commands.
#[must_use]
pub fn detect_fonts(text: &[(&FileEntry, &str)]) -> Vec<String> {
    let mut fonts: Vec<String> = Vec::new();
    for (_, content) in text {
        for line in content.lines() {
            let trimmed = line.trim_start();
            for &cmd in FONT_COMMANDS {
                if trimmed.starts_with(cmd) {
                    if let Some(name) = extract_last_braced(trimmed) {
                        let name = name.trim();
                        if !name.is_empty() {
                            fonts.push(name.to_string());
                        }
                    }
                    break;
                }
            }
        }
    }
    fonts.sort();
    fonts.dedup();
    fonts
}

// ── Warnings ───────────────────────────────────────────────────────────────

fn build_warnings(engine: TexEngine, text: &[(&FileEntry, &str)]) -> Vec<String> {
    let mut warnings = Vec::new();
    if engine == TexEngine::LatexMk {
        warnings.push(
            "XeLaTeX/LuaLaTeX or PostScript features detected — the latexmk / TeX Live \
             engine is required for full compatibility."
                .to_string(),
        );
    }
    // Warn if a latexmkrc is present (we never execute it, just report it).
    if text.iter().any(|(entry, _)| is_latexmkrc(&entry.path)) {
        warnings.push(
            "A latexmkrc configuration file was found and analysed (never executed). \
             Engine and options have been inferred from its contents."
                .to_string(),
        );
    }
    warnings
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Extract the content of the last `{…}` group on a line.
fn extract_last_braced(s: &str) -> Option<&str> {
    let open = s.rfind('{')?;
    let after = &s[open + 1..];
    let close = after.find('}')?;
    Some(&after[..close])
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn text_entry(path: &str, content: &str) -> FileEntry {
        FileEntry::new(path, content.as_bytes().to_vec())
    }

    fn bin_entry(path: &str) -> FileEntry {
        FileEntry::new(path, vec![0xFF, 0xD8, 0xFF]) // JPEG magic (invalid UTF-8)
    }

    // ── FileEntry ──

    #[test]
    fn file_entry_new_and_as_text() {
        let e = FileEntry::new("main.tex", b"hello".to_vec());
        assert_eq!(e.path, "main.tex");
        assert_eq!(e.as_text(), Some("hello"));
    }

    #[test]
    fn file_entry_binary_as_text_returns_none() {
        let e = bin_entry("logo.png");
        assert!(e.as_text().is_none());
    }

    #[test]
    fn file_entry_derives() {
        let a = FileEntry::new("a.tex", b"x".to_vec());
        let b = a.clone();
        assert_eq!(a, b);
        assert!(format!("{a:?}").contains("FileEntry"));
    }

    // ── TexEngine / BibTool labels ──

    #[test]
    fn tex_engine_labels() {
        assert!(TexEngine::Tectonic.label().contains("Tectonic"));
        assert!(TexEngine::LatexMk.label().contains("latexmk"));
    }

    #[test]
    fn bib_tool_labels() {
        assert_eq!(BibTool::None.label(), "None");
        assert_eq!(BibTool::BibTeX.label(), "BibTeX");
        assert_eq!(BibTool::Biber.label(), "Biber");
    }

    #[test]
    fn tex_engine_derives() {
        let e = TexEngine::Tectonic;
        assert_eq!(e, TexEngine::Tectonic);
        assert_ne!(e, TexEngine::LatexMk);
        assert!(format!("{e:?}").contains("Tectonic"));
        let copied = e;
        assert_eq!(copied, e);
    }

    #[test]
    fn bib_tool_derives() {
        let b = BibTool::BibTeX;
        assert_eq!(b, BibTool::BibTeX);
        assert_ne!(b, BibTool::None);
        assert!(format!("{b:?}").contains("BibTeX"));
        let copied = b;
        assert_eq!(copied, b);
    }

    // ── tex_root_hint ──

    #[test]
    fn tex_root_hint_classic_form() {
        let content = "% preamble\n%!TEX root = main.tex\n\\section{x}";
        assert_eq!(tex_root_hint(content), Some("main.tex".to_string()));
    }

    #[test]
    fn tex_root_hint_spaced_form() {
        let content = "% !TEX root = chapter.tex\n\\section{x}";
        assert_eq!(tex_root_hint(content), Some("chapter.tex".to_string()));
    }

    #[test]
    fn tex_root_hint_empty_value_skipped() {
        // "%!TEX root =" with nothing after → no hint returned.
        let content = "%!TEX root =\nsome other content";
        assert_eq!(tex_root_hint(content), None);
    }

    #[test]
    fn tex_root_hint_unrelated_line_skipped() {
        let content = "% This is a normal comment\n\\documentclass{article}";
        assert_eq!(tex_root_hint(content), None);
    }

    #[test]
    fn tex_root_hint_empty_content() {
        assert_eq!(tex_root_hint(""), None);
    }

    // ── engine_from_program_comment ──

    #[test]
    fn program_comment_xelatex() {
        let content = "%!TEX program = xelatex\n\\documentclass{article}";
        assert_eq!(
            engine_from_program_comment(content),
            Some(TexEngine::LatexMk)
        );
    }

    #[test]
    fn program_comment_spaced_lualatex() {
        let content = "% !TEX program = lualatex\n\\documentclass{article}";
        assert_eq!(
            engine_from_program_comment(content),
            Some(TexEngine::LatexMk)
        );
    }

    #[test]
    fn program_comment_pdflatex() {
        let content = "%!TEX program = pdflatex\n\\documentclass{article}";
        assert_eq!(
            engine_from_program_comment(content),
            Some(TexEngine::Tectonic)
        );
    }

    #[test]
    fn program_comment_absent() {
        assert_eq!(engine_from_program_comment("\\documentclass{article}"), None);
    }

    // ── is_latexmkrc ──

    #[test]
    fn is_latexmkrc_detects_both_forms() {
        assert!(is_latexmkrc("latexmkrc"));
        assert!(is_latexmkrc(".latexmkrc"));
        assert!(is_latexmkrc("project/latexmkrc"));
        assert!(!is_latexmkrc("main.tex"));
        assert!(!is_latexmkrc("notlatexmkrc.txt"));
    }

    // ── latexmkrc_engine ──

    #[test]
    fn latexmkrc_engine_xelatex() {
        let content = "$pdflatex = 'xelatex %O %S';\n";
        assert_eq!(latexmkrc_engine(content), Some(TexEngine::LatexMk));
    }

    #[test]
    fn latexmkrc_engine_lualatex() {
        let content = "$latex = 'lualatex';\n";
        assert_eq!(latexmkrc_engine(content), Some(TexEngine::LatexMk));
    }

    #[test]
    fn latexmkrc_engine_no_match() {
        let content = "# just some comment\n$pdf_mode = 1;\n";
        assert_eq!(latexmkrc_engine(content), None);
    }

    // ── engine_needs_latexmk ──

    #[test]
    fn fontspec_triggers_latexmk() {
        let pkgs = vec!["amsmath".to_string(), "fontspec".to_string()];
        assert!(engine_needs_latexmk(&pkgs));
    }

    #[test]
    fn pstricks_triggers_latexmk() {
        let pkgs = vec!["pstricks".to_string()];
        assert!(engine_needs_latexmk(&pkgs));
    }

    #[test]
    fn no_special_packages_no_latexmk() {
        let pkgs = vec!["amsmath".to_string(), "geometry".to_string()];
        assert!(!engine_needs_latexmk(&pkgs));
    }

    #[test]
    fn empty_packages_no_latexmk() {
        assert!(!engine_needs_latexmk(&[]));
    }

    // ── detect_packages ──

    #[test]
    fn extracts_simple_packages() {
        let entries = [text_entry(
            "main.tex",
            "\\usepackage{amsmath}\n\\usepackage{geometry}\n",
        )];
        let pkgs = detect_packages(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert!(pkgs.contains(&"amsmath".to_string()));
        assert!(pkgs.contains(&"geometry".to_string()));
    }

    #[test]
    fn extracts_bracketed_and_multi_package() {
        let entries = [text_entry(
            "main.tex",
            "\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath,amssymb}\n",
        )];
        let pkgs = detect_packages(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert!(pkgs.contains(&"inputenc".to_string()));
        assert!(pkgs.contains(&"amsmath".to_string()));
        assert!(pkgs.contains(&"amssymb".to_string()));
    }

    #[test]
    fn skips_non_tex_files_for_packages() {
        let entries = [text_entry("readme.md", "\\usepackage{notreal}\n")];
        let pkgs = detect_packages(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert!(pkgs.is_empty());
    }

    #[test]
    fn deduplicates_packages() {
        let entries = [
            text_entry("a.tex", "\\usepackage{amsmath}\n"),
            text_entry("b.tex", "\\usepackage{amsmath}\n"),
        ];
        let pkgs = detect_packages(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert_eq!(pkgs.iter().filter(|p| p.as_str() == "amsmath").count(), 1);
    }

    // ── detect_fonts ──

    #[test]
    fn detects_setmainfont() {
        let entries = [text_entry(
            "main.tex",
            "\\setmainfont{Linux Libertine O}\n\\setsansfont{Linux Biolinum O}\n",
        )];
        let fonts = detect_fonts(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert!(fonts.contains(&"Linux Libertine O".to_string()));
        assert!(fonts.contains(&"Linux Biolinum O".to_string()));
    }

    #[test]
    fn no_font_commands_returns_empty() {
        let entries = [text_entry("main.tex", "\\documentclass{article}\n")];
        let fonts = detect_fonts(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert!(fonts.is_empty());
    }

    // ── detect_encoding ──

    #[test]
    fn detects_utf8_encoding() {
        let entries = [text_entry(
            "main.tex",
            "\\usepackage[utf8]{inputenc}\n",
        )];
        let enc = detect_encoding(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert_eq!(enc, "utf8");
    }

    #[test]
    fn encoding_line_no_brackets_returns_empty() {
        // \usepackage{inputenc} — no options → no encoding extracted.
        let entries = [text_entry("main.tex", "\\usepackage{inputenc}\n")];
        let enc = detect_encoding(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert_eq!(enc, "");
    }

    #[test]
    fn encoding_unclosed_bracket_returns_empty() {
        // malformed: [utf8 with no closing ]
        let entries = [text_entry("main.tex", "\\usepackage[utf8{inputenc}\n")];
        let enc = detect_encoding(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert_eq!(enc, "");
    }

    #[test]
    fn no_inputenc_returns_empty() {
        let entries = [text_entry("main.tex", "\\usepackage{amsmath}\n")];
        let enc = detect_encoding(&entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>());
        assert_eq!(enc, "");
    }

    // ── clean_export_paths ──

    #[test]
    fn clean_export_strips_galley_paths() {
        let paths = vec![
            "main.tex".to_string(),
            ".galley/project.toml".to_string(),
            ".galley/cache/aux".to_string(),
            ".galley".to_string(),
            "sections/intro.tex".to_string(),
        ];
        let clean = clean_export_paths(&paths);
        assert_eq!(clean, vec!["main.tex", "sections/intro.tex"]);
    }

    #[test]
    fn clean_export_no_galley_paths_unchanged() {
        let paths = vec!["main.tex".to_string(), "refs.bib".to_string()];
        let clean = clean_export_paths(&paths);
        assert_eq!(clean, paths);
    }

    // ── analyze_project (integration) ──

    #[test]
    fn analyze_empty_entries() {
        let profile = analyze_project(&[]);
        assert_eq!(profile.root_file, "");
        assert_eq!(profile.engine, TexEngine::Tectonic);
        assert_eq!(profile.bib_tool, BibTool::None);
        assert_eq!(profile.encoding, "");
        assert!(profile.packages.is_empty());
        assert!(profile.fonts.is_empty());
        assert!(profile.warnings.is_empty());
    }

    #[test]
    fn analyze_detects_root_via_documentclass() {
        let entries = vec![
            text_entry("sections/intro.tex", "\\section{Intro}\n"),
            text_entry(
                "main.tex",
                "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n",
            ),
        ];
        let profile = analyze_project(&entries);
        assert_eq!(profile.root_file, "main.tex");
    }

    #[test]
    fn analyze_detects_root_via_tex_root_hint() {
        let entries = vec![text_entry(
            "ch1.tex",
            "%!TEX root = paper.tex\n\\section{One}\n",
        )];
        let profile = analyze_project(&entries);
        assert_eq!(profile.root_file, "paper.tex");
    }

    #[test]
    fn analyze_detects_xelatex_engine_from_fontspec() {
        let entries = vec![text_entry(
            "main.tex",
            "\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}\nx\n\\end{document}",
        )];
        let profile = analyze_project(&entries);
        assert_eq!(profile.engine, TexEngine::LatexMk);
        assert!(!profile.warnings.is_empty());
    }

    #[test]
    fn analyze_detects_engine_from_program_comment() {
        let entries = vec![text_entry(
            "main.tex",
            "%!TEX program = xelatex\n\\documentclass{article}\n\\begin{document}x\\end{document}",
        )];
        let profile = analyze_project(&entries);
        assert_eq!(profile.engine, TexEngine::LatexMk);
    }

    #[test]
    fn analyze_detects_engine_from_latexmkrc() {
        let entries = vec![
            text_entry(
                "main.tex",
                "\\documentclass{article}\n\\begin{document}x\\end{document}",
            ),
            text_entry("latexmkrc", "$pdflatex = 'xelatex %O %S';\n"),
        ];
        let profile = analyze_project(&entries);
        assert_eq!(profile.engine, TexEngine::LatexMk);
        // latexmkrc warning should be present.
        assert!(profile.warnings.iter().any(|w| w.contains("latexmkrc")));
    }

    #[test]
    fn analyze_detects_biber() {
        let entries = vec![text_entry(
            "main.tex",
            "\\documentclass{article}\n\\usepackage{biblatex}\n\\begin{document}x\\end{document}",
        )];
        let profile = analyze_project(&entries);
        assert_eq!(profile.bib_tool, BibTool::Biber);
    }

    #[test]
    fn analyze_detects_bibtex_backend_override() {
        let entries = vec![text_entry(
            "main.tex",
            "\\usepackage[backend=bibtex]{biblatex}\n\\begin{document}x\\end{document}",
        )];
        let profile = analyze_project(&entries);
        assert_eq!(profile.bib_tool, BibTool::BibTeX);
    }

    #[test]
    fn analyze_detects_classic_bibtex() {
        let entries = vec![text_entry(
            "main.tex",
            "\\documentclass{article}\n\\begin{document}\n\\bibliography{refs}\n\\end{document}",
        )];
        let profile = analyze_project(&entries);
        assert_eq!(profile.bib_tool, BibTool::BibTeX);
    }

    #[test]
    fn analyze_detects_utf8_encoding() {
        let entries = vec![text_entry(
            "main.tex",
            "\\usepackage[utf8]{inputenc}\n\\begin{document}x\\end{document}",
        )];
        let profile = analyze_project(&entries);
        assert_eq!(profile.encoding, "utf8");
    }

    #[test]
    fn analyze_skips_binary_entries() {
        let entries = vec![
            bin_entry("logo.png"),
            text_entry(
                "main.tex",
                "\\documentclass{article}\n\\begin{document}x\\end{document}",
            ),
        ];
        let profile = analyze_project(&entries);
        assert_eq!(profile.root_file, "main.tex");
    }

    #[test]
    fn project_profile_derives() {
        let p = ProjectProfile {
            root_file: "main.tex".to_string(),
            engine: TexEngine::Tectonic,
            bib_tool: BibTool::None,
            encoding: "utf8".to_string(),
            packages: vec!["amsmath".to_string()],
            fonts: vec![],
            warnings: vec![],
        };
        let q = p.clone();
        assert_eq!(p, q);
        assert!(format!("{p:?}").contains("ProjectProfile"));
    }

    // ── Branch coverage for None arms ──

    #[test]
    fn latexmkrc_present_but_no_engine_falls_through() {
        // latexmkrc exists but has no xelatex/lualatex → None arm of
        // `if let Some(engine) = latexmkrc_engine(content)` (line 226).
        let entries = vec![
            text_entry(
                "main.tex",
                "\\documentclass{article}\n\\begin{document}x\\end{document}",
            ),
            text_entry("latexmkrc", "# just set mode\n$pdf_mode = 1;\n"),
        ];
        let profile = analyze_project(&entries);
        // No engine hint → Tectonic (package heuristics: no special packages).
        assert_eq!(profile.engine, TexEngine::Tectonic);
    }

    #[test]
    fn usepackage_without_braces_is_skipped() {
        // `\usepackage` on a line with no `{…}` hits the None arm of
        // `extract_last_braced` in `detect_packages` (line 366).
        let entries = [text_entry(
            "main.tex",
            "\\usepackage\n\\usepackage{amsmath}\n",
        )];
        let pkgs = detect_packages(
            &entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>(),
        );
        // Only the second line contributes a package.
        assert_eq!(pkgs, vec!["amsmath".to_string()]);
    }

    #[test]
    fn font_command_without_braces_is_skipped() {
        // A font command with no `{…}` hits the None arm of
        // `extract_last_braced` in `detect_fonts` (line 399).
        let entries = [text_entry(
            "main.tex",
            "\\setmainfont\n\\setmainfont{Linux Libertine O}\n",
        )];
        let fonts = detect_fonts(
            &entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>(),
        );
        assert_eq!(fonts, vec!["Linux Libertine O".to_string()]);
    }

    #[test]
    fn trailing_comma_in_usepackage_skips_empty_name() {
        // `\usepackage{amsmath,}` produces an empty string after the trailing
        // comma; the `if !name.is_empty()` guard must reject it without panic.
        let entries = [text_entry("main.tex", "\\usepackage{amsmath,}\n")];
        let pkgs = detect_packages(
            &entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>(),
        );
        assert_eq!(pkgs, vec!["amsmath".to_string()]);
    }

    #[test]
    fn empty_font_braces_are_skipped() {
        // `\setmainfont{}` yields an empty name; the guard must discard it.
        let entries = [text_entry(
            "main.tex",
            "\\setmainfont{}\n\\setmainfont{Latin Modern Roman}\n",
        )];
        let fonts = detect_fonts(
            &entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>(),
        );
        assert_eq!(fonts, vec!["Latin Modern Roman".to_string()]);
    }

    #[test]
    fn usepackage_unclosed_brace_is_skipped() {
        // `\usepackage{amsmath` (no closing brace) hits the second `?` inside
        // `extract_last_braced` — `find('}')` returns None.
        let entries = [text_entry(
            "main.tex",
            "\\usepackage{amsmath\n\\usepackage{geometry}\n",
        )];
        let pkgs = detect_packages(
            &entries.iter().map(|e| (e, e.as_text().unwrap())).collect::<Vec<_>>(),
        );
        assert_eq!(pkgs, vec!["geometry".to_string()]);
    }
}
