//! Include-graph extraction: finding `\input`, `\include`, and `\subfile`
//! directives in LaTeX source without executing or parsing the full grammar.
//!
//! This is the pure, I/O-free half of multi-file project awareness. The caller
//! (the Tauri shell or a test) supplies the source text; we return the raw
//! referenced paths in document order so the UI can display the include tree
//! and the compile path can choose the correct build root.

/// Parse `\input{…}`, `\include{…}`, and `\subfile{…}` directives from the
/// given LaTeX source, returning each referenced path in document order.
///
/// The path is returned exactly as written in the source (no extension
/// normalization). Lines beginning with `%` (comments) are skipped; an inline
/// `%` strips the rest of the line before searching for commands.
///
/// Use [`resolve_include_path`] to normalize the raw paths to actual file names.
#[must_use]
pub fn parse_includes(source: &str) -> Vec<String> {
    const CMDS: &[&str] = &["\\input{", "\\include{", "\\subfile{"];
    let mut result = Vec::new();
    for line in source.lines() {
        let line = strip_comment(line);
        for cmd in CMDS {
            let mut rest = line;
            while let Some(start) = rest.find(cmd) {
                let after = &rest[start + cmd.len()..];
                match after.find('}') {
                    Some(end) => {
                        let path = after[..end].trim();
                        if !path.is_empty() {
                            result.push(path.to_string());
                        }
                        rest = &rest[start + cmd.len() + end + 1..];
                    }
                    None => break,
                }
            }
        }
    }
    result
}

/// Normalize an include path: when the last path component has no extension,
/// append `.tex` — matching LaTeX's own file-resolution rule.
///
/// ```
/// # use galley_core::resolve_include_path;
/// assert_eq!(resolve_include_path("chapters/intro"), "chapters/intro.tex");
/// assert_eq!(resolve_include_path("chapters/intro.tex"), "chapters/intro.tex");
/// assert_eq!(resolve_include_path("refs.bib"), "refs.bib");
/// ```
#[must_use]
pub fn resolve_include_path(raw: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }
    if std::path::Path::new(raw).extension().is_some() {
        raw.to_string()
    } else {
        format!("{raw}.tex")
    }
}

/// Strip the comment portion of a LaTeX source line (from the first `%` onward).
fn strip_comment(line: &str) -> &str {
    match line.find('%') {
        Some(i) => &line[..i],
        None => line,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_source_produces_no_includes() {
        assert!(parse_includes("").is_empty());
    }

    #[test]
    fn finds_input_include_and_subfile() {
        let src = "\\input{ch1}\n\\include{ch2}\n\\subfile{ch3}";
        assert_eq!(parse_includes(src), vec!["ch1", "ch2", "ch3"]);
    }

    #[test]
    fn skips_fully_commented_lines() {
        let src = "% \\input{nope}\n\\input{yes}";
        assert_eq!(parse_includes(src), vec!["yes"]);
    }

    #[test]
    fn strips_inline_comment_before_searching() {
        // The command before `%` is found; the one after is not.
        let src = "\\input{a} % \\input{b}";
        assert_eq!(parse_includes(src), vec!["a"]);
    }

    #[test]
    fn trims_whitespace_in_paths() {
        let src = "\\input{ spaced }";
        assert_eq!(parse_includes(src), vec!["spaced"]);
    }

    #[test]
    fn ignores_empty_braces() {
        let src = "\\input{}";
        assert!(parse_includes(src).is_empty());
    }

    #[test]
    fn handles_missing_closing_brace() {
        let src = "\\input{unclosed";
        assert!(parse_includes(src).is_empty());
    }

    #[test]
    fn finds_multiple_includes_on_one_line() {
        let src = "\\input{a}\\include{b}";
        assert_eq!(parse_includes(src), vec!["a", "b"]);
    }

    #[test]
    fn strip_comment_covers_both_arms() {
        // No `%` — None arm: the whole line is returned.
        assert_eq!(strip_comment("no percent"), "no percent");
        // Leading `%` — Some(0): returns empty slice.
        assert_eq!(strip_comment("% comment"), "");
        // Inline `%` — Some(i>0): returns prefix.
        assert_eq!(strip_comment("text % tail"), "text ");
    }

    #[test]
    fn resolve_appends_tex_to_extensionless_paths() {
        assert_eq!(resolve_include_path("chapter"), "chapter.tex");
        assert_eq!(
            resolve_include_path("path/to/chapter"),
            "path/to/chapter.tex"
        );
    }

    #[test]
    fn resolve_leaves_paths_with_extensions_unchanged() {
        assert_eq!(resolve_include_path("chapter.tex"), "chapter.tex");
        assert_eq!(resolve_include_path("refs.bib"), "refs.bib");
        assert_eq!(resolve_include_path("figure.pdf"), "figure.pdf");
    }

    #[test]
    fn resolve_returns_empty_for_empty_input() {
        assert_eq!(resolve_include_path(""), "");
    }
}
