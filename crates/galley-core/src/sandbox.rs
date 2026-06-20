//! Compile and import sandbox analysis.
//!
//! This module provides pure, I/O-free analysis functions that detect
//! potentially dangerous constructs in LaTeX source files and archive paths
//! before they reach the compile engine or the filesystem. Nothing here runs
//! TeX or touches disk — it only reads strings and returns findings.
//!
//! The two threat categories guarded here are:
//!
//! * **Shell-escape** — `\write18`, `\immediate\write18`, `\ShellEscape`,
//!   `\directlua`, `\luaexec`, and pipe-input constructs (`\input|…`) that
//!   allow a LaTeX document to execute arbitrary OS commands. Galley disables
//!   shell-escape at the engine level by default; this scanner provides an
//!   additional pre-compile warning layer.
//!
//! * **Input path traversal** — `\input` and `\include` arguments that
//!   reference paths outside the project directory (`..`, absolute paths like
//!   `/etc/passwd`, or pipe inputs). The embedded Tectonic engine's VFS
//!   already confines I/O to the project root; this scanner surfaces the
//!   pattern for diagnostics and the future system-latexmk fallback.
//!
//! # Usage
//!
//! ```
//! use galley_core::sandbox::{scan_source, ShellEscapePolicy};
//!
//! let source = r"\write18{rm -rf /}";
//! let report = scan_source(source);
//! assert!(!report.is_clean());
//! assert_eq!(report.shell_escape.len(), 1);
//! ```

use std::fmt;

// ── Policy ──────────────────────────────────────────────────────────────────

/// Whether the TeX engine may execute OS commands through shell-escape.
///
/// Galley defaults to [`ShellEscapePolicy::Off`] for all user documents. An
/// operator may grant per-project permission via
/// [`ShellEscapePolicy::PerProjectOptIn`], but the user must explicitly enable
/// it and Galley will display a visible warning before compiling.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellEscapePolicy {
    /// Shell-escape is disabled. Any `\write18` or equivalent in the source
    /// will not execute. This is the safe default and the only option for
    /// documents from untrusted sources.
    Off,
    /// The user has explicitly opted in for this specific project. Galley
    /// displays a warning and requires the user to confirm before each compile.
    PerProjectOptIn,
}

impl fmt::Display for ShellEscapePolicy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            ShellEscapePolicy::Off => "off",
            ShellEscapePolicy::PerProjectOptIn => "per-project-opt-in",
        };
        f.write_str(label)
    }
}

// ── Shell-escape detection ───────────────────────────────────────────────────

/// Patterns that indicate a LaTeX source attempts to invoke shell-escape.
///
/// Ordered from most specific to least specific; the scanner stops
/// mid-source on a per-occurrence basis and collects all occurrences.
static SHELL_ESCAPE_NEEDLES: &[&str] = &[
    r"\immediate\write18",
    r"\write18",
    r"\ShellEscape",
    r"\directlua",
    r"\luaexec",
    r"\input|",
];

/// Scan `source` for shell-escape command patterns.
///
/// Returns a list of (offset, matched_pattern) strings for every occurrence
/// found. An empty list means no shell-escape command was detected.
///
/// The scanner is conservative: it reports occurrences even inside comment
/// lines (lines starting with `%`), because LaTeX source manipulation could
/// re-enable them.
pub fn scan_shell_escape(source: &str) -> Vec<String> {
    let mut findings = Vec::new();
    for needle in SHELL_ESCAPE_NEEDLES {
        let mut start = 0;
        while let Some(pos) = source[start..].find(needle) {
            findings.push(format!("{}:{}", pos + start, needle));
            start += pos + 1;
        }
    }
    findings
}

// ── Input-path extraction and traversal detection ────────────────────────────

/// Extract the arguments of `\input{…}`, `\include{…}`, and `\subfile{…}`
/// from `source`.
///
/// Returns one string per found argument, with leading/trailing whitespace
/// trimmed. The extraction is conservative (brace-balanced, single-level);
/// deeply nested braces are truncated at the first unmatched `}`.
pub fn scan_input_paths(source: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for needle in [r"\input{", r"\include{", r"\subfile{"] {
        let mut rest = source;
        while let Some(pos) = rest.find(needle) {
            rest = &rest[pos + needle.len()..];
            // Collect until the matching closing brace.
            let mut depth: usize = 1;
            let mut arg = String::new();
            for ch in rest.chars() {
                match ch {
                    '{' => {
                        depth += 1;
                        arg.push(ch);
                    }
                    '}' => {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                        arg.push(ch);
                    }
                    _ => arg.push(ch),
                }
            }
            let trimmed = arg.trim().to_string();
            if !trimmed.is_empty() {
                paths.push(trimmed);
            }
        }
    }
    paths
}

/// Return `true` when an `\input` argument should be treated as a traversal or
/// injection attempt.
///
/// The following patterns are flagged:
/// * Starts with `..` — relative climb out of the project.
/// * Starts with `/` or `\` — Unix/Windows absolute path.
/// * Second character is `:` — Windows drive letter (`C:\…`, `c:/…`).
/// * Starts with `|` — pipe input (`\input|"cmd"` in some engines).
#[must_use]
pub fn is_traversal_input(path: &str) -> bool {
    if path.is_empty() {
        return false;
    }
    let bytes = path.as_bytes();
    // Relative climb.
    if path.starts_with("..") {
        return true;
    }
    // Unix absolute.
    if bytes[0] == b'/' {
        return true;
    }
    // Windows absolute (backslash) or pipe.
    if bytes[0] == b'\\' || bytes[0] == b'|' {
        return true;
    }
    // Windows drive letter: at least two chars, second is `:`.
    if bytes.len() >= 2 && bytes[1] == b':' {
        return true;
    }
    false
}

// ── Report ────────────────────────────────────────────────────────────────────

/// The result of scanning a LaTeX source file for sandbox violations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SandboxReport {
    /// Shell-escape occurrences found, each formatted as `"offset:pattern"`.
    pub shell_escape: Vec<String>,
    /// `\input`/`\include`/`\subfile` arguments that look like traversal or
    /// pipe-injection attempts.
    pub traversal_inputs: Vec<String>,
}

impl SandboxReport {
    /// `true` when no shell-escape patterns or traversal inputs were found.
    #[must_use]
    pub fn is_clean(&self) -> bool {
        self.shell_escape.is_empty() && self.traversal_inputs.is_empty()
    }
}

/// Scan `source` for all sandbox concerns and return a [`SandboxReport`].
///
/// This is the primary entry point for pre-compile analysis. Callers should
/// check [`SandboxReport::is_clean`]; if it returns `false` they should
/// surface the findings to the user before proceeding.
#[must_use]
pub fn scan_source(source: &str) -> SandboxReport {
    let shell_escape = scan_shell_escape(source);
    let input_paths = scan_input_paths(source);
    let traversal_inputs = input_paths
        .into_iter()
        .filter(|p| is_traversal_input(p))
        .collect();
    SandboxReport {
        shell_escape,
        traversal_inputs,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── ShellEscapePolicy ──

    #[test]
    fn policy_displays_stable_labels() {
        assert_eq!(ShellEscapePolicy::Off.to_string(), "off");
        assert_eq!(
            ShellEscapePolicy::PerProjectOptIn.to_string(),
            "per-project-opt-in"
        );
    }

    #[test]
    fn policy_derives_are_usable() {
        let a = ShellEscapePolicy::Off;
        let b = ShellEscapePolicy::PerProjectOptIn;
        assert_ne!(a, b);
        assert_eq!(a, ShellEscapePolicy::Off);
        let copied = a;
        assert_eq!(copied, a);
        assert!(format!("{a:?}").contains("Off"));
        assert!(format!("{b:?}").contains("PerProjectOptIn"));
    }

    // ── scan_shell_escape ──

    #[test]
    fn detects_write18() {
        let source = r"\write18{echo hello}";
        let findings = scan_shell_escape(source);
        assert!(
            findings.iter().any(|f| f.contains(r"\write18")),
            "expected \\write18 finding, got: {findings:?}"
        );
    }

    #[test]
    fn detects_immediate_write18() {
        let source = r"\immediate\write18{ls}";
        let findings = scan_shell_escape(source);
        assert!(findings.iter().any(|f| f.contains(r"\immediate\write18")));
    }

    #[test]
    fn detects_shell_escape_macro() {
        let source = r"\ShellEscape{rm -rf /}";
        let findings = scan_shell_escape(source);
        assert!(findings.iter().any(|f| f.contains(r"\ShellEscape")));
    }

    #[test]
    fn detects_directlua() {
        let source = r"\directlua{os.execute('ls')}";
        let findings = scan_shell_escape(source);
        assert!(findings.iter().any(|f| f.contains(r"\directlua")));
    }

    #[test]
    fn detects_luaexec() {
        let source = r"\luaexec{print('hello')}";
        let findings = scan_shell_escape(source);
        assert!(findings.iter().any(|f| f.contains(r"\luaexec")));
    }

    #[test]
    fn detects_pipe_input() {
        let source = r"\input|ls";
        let findings = scan_shell_escape(source);
        assert!(findings.iter().any(|f| f.contains(r"\input|")));
    }

    #[test]
    fn detects_multiple_occurrences() {
        let source = r"\write18{a}\write18{b}";
        let findings = scan_shell_escape(source);
        assert!(
            findings.len() >= 2,
            "expected at least 2 findings, got {findings:?}"
        );
    }

    #[test]
    fn returns_empty_for_clean_source() {
        let source = r"\documentclass{article}\begin{document}Hello\end{document}";
        assert!(scan_shell_escape(source).is_empty());
    }

    // ── scan_input_paths ──

    #[test]
    fn extracts_simple_input() {
        let source = r"\input{chapters/intro}";
        let paths = scan_input_paths(source);
        assert!(paths.contains(&"chapters/intro".to_string()));
    }

    #[test]
    fn extracts_include_and_subfile() {
        let source = r"\include{body}\subfile{appendix/a}";
        let paths = scan_input_paths(source);
        assert!(paths.contains(&"body".to_string()));
        assert!(paths.contains(&"appendix/a".to_string()));
    }

    #[test]
    fn extracts_multiple_inputs() {
        let source = r"\input{a}\input{b}\input{c}";
        let paths = scan_input_paths(source);
        assert_eq!(paths, vec!["a", "b", "c"]);
    }

    #[test]
    fn trims_whitespace_in_argument() {
        let source = "\\input{ ../bad }";
        let paths = scan_input_paths(source);
        assert!(paths.contains(&"../bad".to_string()));
    }

    #[test]
    fn handles_nested_braces_in_argument() {
        let source = r"\input{dir/{sub}/file}";
        let paths = scan_input_paths(source);
        assert!(!paths.is_empty());
    }

    #[test]
    fn returns_empty_when_no_inputs() {
        let source = r"\documentclass{article}\begin{document}\end{document}";
        assert!(scan_input_paths(source).is_empty());
    }

    #[test]
    fn skips_empty_or_whitespace_only_arguments() {
        // An empty \input{} argument is skipped rather than pushed as "".
        let source = r"\input{}\include{ }\input{real}";
        let paths = scan_input_paths(source);
        assert_eq!(paths, vec!["real"]);
    }

    // ── is_traversal_input ──

    #[test]
    fn flags_dotdot_traversal() {
        assert!(is_traversal_input("../outside"));
        assert!(is_traversal_input("../../etc/passwd"));
    }

    #[test]
    fn flags_absolute_unix_path() {
        assert!(is_traversal_input("/etc/passwd"));
        assert!(is_traversal_input("/home/user/file"));
    }

    #[test]
    fn flags_absolute_windows_backslash() {
        assert!(is_traversal_input("\\Windows\\System32"));
    }

    #[test]
    fn flags_windows_drive_letter() {
        assert!(is_traversal_input("C:\\Users\\file"));
        assert!(is_traversal_input("c:/documents/file"));
    }

    #[test]
    fn flags_pipe_input() {
        assert!(is_traversal_input("|ls -la"));
    }

    #[test]
    fn accepts_normal_relative_paths() {
        assert!(!is_traversal_input("chapters/intro"));
        assert!(!is_traversal_input("main"));
        assert!(!is_traversal_input("appendix/a"));
    }

    #[test]
    fn accepts_empty_path() {
        assert!(!is_traversal_input(""));
    }

    // ── SandboxReport / scan_source ──

    #[test]
    fn clean_source_produces_clean_report() {
        let source = r"\documentclass{article}\begin{document}\input{chapters/intro}\end{document}";
        let report = scan_source(source);
        assert!(report.is_clean());
        assert!(report.shell_escape.is_empty());
        assert!(report.traversal_inputs.is_empty());
    }

    #[test]
    fn shell_escape_makes_report_dirty() {
        let source = r"\write18{rm -rf /}";
        let report = scan_source(source);
        assert!(!report.is_clean());
        assert!(!report.shell_escape.is_empty());
    }

    #[test]
    fn traversal_input_makes_report_dirty() {
        let source = r"\input{../../etc/passwd}";
        let report = scan_source(source);
        assert!(!report.is_clean());
        assert!(report
            .traversal_inputs
            .contains(&"../../etc/passwd".to_string()));
    }

    #[test]
    fn combined_violations_both_reported() {
        let source = r"\write18{ls}\input{/etc/shadow}";
        let report = scan_source(source);
        assert!(!report.is_clean());
        assert!(!report.shell_escape.is_empty());
        assert!(!report.traversal_inputs.is_empty());
    }

    #[test]
    fn report_derives_are_usable() {
        let r1 = scan_source("");
        let r2 = r1.clone();
        assert_eq!(r1, r2);
        assert!(format!("{r1:?}").contains("SandboxReport"));
    }
}
