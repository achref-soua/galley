//! Turning a raw TeX log into structured, friendly diagnostics.
//!
//! A LaTeX engine's log is a wall of text: the message that matters is buried
//! among bundle paths, font notes, and box statistics, and the location is
//! reported in TeX's own idiom (`l.42`, `on input line 42`, `at lines 12--14`).
//! This module reads that log and produces a [`Vec<Diagnostic>`] — each carrying a
//! severity, the cleaned message, a source line where the log gives one, and a
//! plain-language explanation in Galley's voice (§2.7) for the common offenders.
//!
//! Everything here is pure string work: no engine, no filesystem, no `regex`
//! dependency. That keeps the crate dependency-free and lets the parser be driven
//! to full coverage with fixture log snippets. The UI consumes the result through
//! the existing compile log (§11.3): the desktop shell parses the log it already
//! captured and ships the structured diagnostics to the editor's gutter and the
//! problems panel.
//!
//! Scope (v0.1.2): the build root is a single file, so a source *file* is recorded
//! only when the log names one directly (a missing `\input`/package/graphic). Line
//! numbers — the locator the editor jumps to — are extracted wherever TeX prints
//! one. Attributing every diagnostic to a file across an include graph waits for
//! multi-file awareness (v0.2.1), where there is a graph to attribute against.

/// How serious a diagnostic is — and how the UI should weight it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    /// A hard error: the build did not produce a (correct) document.
    Error,
    /// A warning: the build finished but something needs attention.
    Warning,
    /// A bad box: an over/underfull line — typographic, rarely fatal.
    BadBox,
}

impl Severity {
    /// A short, stable identifier for serialization and styling.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Severity::Error => "error",
            Severity::Warning => "warning",
            Severity::BadBox => "badbox",
        }
    }
}

/// What kind of problem a diagnostic describes. Each maps to a fixed severity and
/// a friendly explanation; the kind also lets the UI style or filter by category.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticKind {
    /// `! Undefined control sequence.` — an unknown command.
    UndefinedControlSequence,
    /// `! Missing $ inserted.` — math used outside math mode.
    MissingDollar,
    /// A runaway argument: a brace opened and never closed.
    RunawayArgument,
    /// `! LaTeX Error: \begin{x} … ended by \end{y}.` — a mismatched environment.
    UnclosedEnvironment,
    /// `! LaTeX Error: File `x' not found.` — a missing input, package, or graphic.
    FileNotFound,
    /// `! Package x Error: …` — a package reported a hard error.
    PackageError,
    /// Any other `! …` error LaTeX or TeX raised.
    LatexError,
    /// `LaTeX Warning: Reference `x' … undefined.` — a dangling `\ref`.
    UndefinedReference,
    /// `LaTeX Warning: Citation `x' … undefined.` — a missing `\cite` key.
    UndefinedCitation,
    /// `LaTeX Warning: Label(s) may have changed. Rerun …` or `Please rerun …`
    /// — cross-references shifted and the engine wants another pass.
    RerunNeeded,
    /// `Package inputenc Warning: inputenc package ignored with utf8 based
    /// engines.` — `inputenc` is a no-op under XeTeX/LuaTeX.
    InputencIgnored,
    /// `LaTeX Warning: Empty `thebibliography' environment …` — the bibliography
    /// produced no entries.
    EmptyBibliography,
    /// Any other `LaTeX Warning: …`.
    LatexWarning,
    /// `Package x Warning: …` — a package raised a warning.
    PackageWarning,
    /// `Overfull \hbox/\vbox …` — content ran past the box.
    OverfullBox,
    /// `Underfull \hbox/\vbox …` — content was stretched too loose.
    UnderfullBox,
    /// A style note from the language server's linter (ChkTeX): not a build
    /// failure, but a usage or typography nit worth tidying. Unlike the other
    /// kinds — which the log parser classifies — these arrive from TexLab already
    /// described, so the message carries the specifics and the severity comes from
    /// the server rather than from [`DiagnosticKind::severity`].
    Style,
}

impl DiagnosticKind {
    /// A short, stable kebab-case identifier for serialization and styling.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            DiagnosticKind::UndefinedControlSequence => "undefined-control-sequence",
            DiagnosticKind::MissingDollar => "missing-dollar",
            DiagnosticKind::RunawayArgument => "runaway-argument",
            DiagnosticKind::UnclosedEnvironment => "unclosed-environment",
            DiagnosticKind::FileNotFound => "file-not-found",
            DiagnosticKind::PackageError => "package-error",
            DiagnosticKind::LatexError => "latex-error",
            DiagnosticKind::UndefinedReference => "undefined-reference",
            DiagnosticKind::UndefinedCitation => "undefined-citation",
            DiagnosticKind::RerunNeeded => "rerun-needed",
            DiagnosticKind::InputencIgnored => "inputenc-ignored",
            DiagnosticKind::EmptyBibliography => "empty-bibliography",
            DiagnosticKind::LatexWarning => "latex-warning",
            DiagnosticKind::PackageWarning => "package-warning",
            DiagnosticKind::OverfullBox => "overfull-box",
            DiagnosticKind::UnderfullBox => "underfull-box",
            DiagnosticKind::Style => "style",
        }
    }

    /// The severity this kind always carries.
    #[must_use]
    pub fn severity(self) -> Severity {
        match self {
            DiagnosticKind::UndefinedControlSequence
            | DiagnosticKind::MissingDollar
            | DiagnosticKind::RunawayArgument
            | DiagnosticKind::UnclosedEnvironment
            | DiagnosticKind::FileNotFound
            | DiagnosticKind::PackageError
            | DiagnosticKind::LatexError => Severity::Error,
            DiagnosticKind::UndefinedReference
            | DiagnosticKind::UndefinedCitation
            | DiagnosticKind::RerunNeeded
            | DiagnosticKind::InputencIgnored
            | DiagnosticKind::EmptyBibliography
            | DiagnosticKind::LatexWarning
            | DiagnosticKind::PackageWarning => Severity::Warning,
            DiagnosticKind::OverfullBox | DiagnosticKind::UnderfullBox => Severity::BadBox,
            // A style note is a warning by nature; a ChkTeX "error" still carries
            // its own severity through [`Diagnostic::lint`], which overrides this.
            DiagnosticKind::Style => Severity::Warning,
        }
    }

    /// A plain-language explanation and fix tip, in Galley's print-shop voice.
    #[must_use]
    pub fn explanation(self) -> &'static str {
        match self {
            DiagnosticKind::UndefinedControlSequence => {
                "That command isn't one LaTeX knows. Check the spelling, or load the package that \
                 defines it."
            }
            DiagnosticKind::MissingDollar => {
                "A math symbol turned up in ordinary text. Wrap the maths in $ … $ (or \\( … \\))."
            }
            DiagnosticKind::RunawayArgument => {
                "A brace was opened and never closed, so TeX kept reading past where it should \
                 stop. Find the missing }."
            }
            DiagnosticKind::UnclosedEnvironment => {
                "An environment was opened but closed by the wrong \\end. Match every \
                 \\begin{…} with its own \\end{…}."
            }
            DiagnosticKind::FileNotFound => {
                "Galley couldn't find that file. Check the name and the path, and that it lives in \
                 the project."
            }
            DiagnosticKind::PackageError => {
                "A package stopped the build. The message above is the package speaking — it \
                 usually says what it needs."
            }
            DiagnosticKind::LatexError => {
                "LaTeX stopped here. The message says what tripped it; the line points at where."
            }
            DiagnosticKind::UndefinedReference => {
                "This \\ref points at a label that doesn't exist yet. Define the \\label, or fix \
                 the name — then recompile."
            }
            DiagnosticKind::UndefinedCitation => {
                "This \\cite key isn't in your bibliography. Add the entry to your .bib, or correct \
                 the key."
            }
            DiagnosticKind::RerunNeeded => {
                "Cross-references shifted on this pass, so a number or page may be stale. Galley \
                 re-runs the engine to settle them — if one still looks wrong, compile once more."
            }
            DiagnosticKind::InputencIgnored => {
                "You're on a Unicode engine (XeTeX or LuaTeX), which already reads UTF-8, so \
                 \\usepackage{inputenc} does nothing here. You can drop that line."
            }
            DiagnosticKind::EmptyBibliography => {
                "The bibliography came out empty — nothing was cited, or the entry list is blank. \
                 Add a \\bibitem (or a \\cite that matches a .bib entry), then recompile."
            }
            DiagnosticKind::LatexWarning => {
                "LaTeX finished but flagged something. Often a rerun settles it; sometimes it wants \
                 a look."
            }
            DiagnosticKind::PackageWarning => {
                "A package raised a note. Usually safe to carry on, but worth a glance."
            }
            DiagnosticKind::OverfullBox => {
                "A line ran into the margin — often a long word or an unbreakable URL. Rewrap it, \
                 or allow a break."
            }
            DiagnosticKind::UnderfullBox => {
                "A line came out looser than ideal. Usually harmless — TeX just couldn't space it \
                 neatly."
            }
            DiagnosticKind::Style => {
                "A style note from ChkTeX. Not an error — just a tidier way to write it, if you \
                 like."
            }
        }
    }
}

/// A single structured problem lifted from the TeX log.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    /// How serious it is.
    pub severity: Severity,
    /// The category of problem.
    pub kind: DiagnosticKind,
    /// The cleaned message taken from the log.
    pub message: String,
    /// The source file the log named, when it named one.
    pub file: Option<String>,
    /// The 1-based source line, when the log gives one.
    pub line: Option<u32>,
    /// A friendly, in-voice explanation and fix tip.
    pub explanation: String,
}

impl Diagnostic {
    /// Build a diagnostic from the language server's linter (ChkTeX, via TexLab).
    ///
    /// Unlike [`Diagnostic::new`], the severity is supplied by the caller rather
    /// than derived from the kind, because the server classifies each note itself
    /// (most are warnings; a few are errors). The kind is always
    /// [`DiagnosticKind::Style`], and the explanation is its standard note.
    #[must_use]
    pub fn lint(
        severity: Severity,
        message: String,
        file: Option<String>,
        line: Option<u32>,
    ) -> Self {
        Self {
            severity,
            kind: DiagnosticKind::Style,
            message,
            file,
            line,
            explanation: DiagnosticKind::Style.explanation().to_string(),
        }
    }

    /// Build a diagnostic for `kind`, deriving its severity and explanation.
    fn new(kind: DiagnosticKind, message: String, file: Option<String>, line: Option<u32>) -> Self {
        Self {
            severity: kind.severity(),
            kind,
            message,
            file,
            line,
            explanation: kind.explanation().to_string(),
        }
    }
}

/// Parse a raw TeX log into structured diagnostics, in the order they appear.
///
/// The log is read line by line. A `! …` line opens an error (its location is
/// filled in from the following `l.<n>` context line); `LaTeX Warning:` and
/// `Package … Warning:` lines become warnings carrying their `on input line`
/// number; and `Overfull`/`Underfull` lines become bad boxes carrying their line
/// range. Lines that match nothing — bundle paths, font notes, banners — are
/// ignored.
#[must_use]
pub fn parse_log(log: &str) -> Vec<Diagnostic> {
    let mut diagnostics: Vec<Diagnostic> = Vec::new();
    for line in log.lines() {
        if let Some(diagnostic) = parse_error_line(line) {
            diagnostics.push(diagnostic);
        } else if let Some((line_number, command)) = parse_location_line(line) {
            attach_location(&mut diagnostics, line_number, command);
        } else if let Some(diagnostic) = parse_warning_line(line) {
            diagnostics.push(diagnostic);
        } else if let Some(diagnostic) = parse_badbox_line(line) {
            diagnostics.push(diagnostic);
        }
    }
    diagnostics
}

/// Recognise a `! …` error line and classify it. The location is attached later
/// from the `l.<n>` context line, so the returned diagnostic has no line yet.
fn parse_error_line(line: &str) -> Option<Diagnostic> {
    let body = line.strip_prefix("! ")?;
    let mut message = clean(body);
    let mut file = None;
    let kind = if body.starts_with("Undefined control sequence") {
        DiagnosticKind::UndefinedControlSequence
    } else if body.starts_with("Missing $ inserted") {
        DiagnosticKind::MissingDollar
    } else if body.starts_with("Paragraph ended before")
        || body.starts_with("File ended while scanning")
    {
        DiagnosticKind::RunawayArgument
    } else if let Some(rest) = body.strip_prefix("LaTeX Error: ") {
        let (latex_kind, named_file, latex_message) = classify_latex_error(rest);
        file = named_file;
        message = latex_message;
        latex_kind
    } else if let Some(rest) = package_error(body) {
        message = clean(rest);
        DiagnosticKind::PackageError
    } else {
        DiagnosticKind::LatexError
    };
    Some(Diagnostic::new(kind, message, file, None))
}

/// Classify the text after `LaTeX Error: ` into a kind, an optional named file,
/// and a cleaned message.
fn classify_latex_error(rest: &str) -> (DiagnosticKind, Option<String>, String) {
    let message = clean(rest);
    if rest.contains("not found") {
        return (DiagnosticKind::FileNotFound, quoted(rest), message);
    }
    if rest.contains(" ended by ") {
        return (DiagnosticKind::UnclosedEnvironment, None, message);
    }
    (DiagnosticKind::LatexError, None, message)
}

/// The message of a `Package <name> Error: <message>` line, if it is one.
fn package_error(body: &str) -> Option<&str> {
    let rest = body.strip_prefix("Package ")?;
    let marker = " Error: ";
    let at = rest.find(marker)?;
    Some(&rest[at + marker.len()..])
}

/// Recognise a `l.<n> <context>` location line, returning the line number and the
/// last command on the context (used to name an undefined control sequence).
fn parse_location_line(line: &str) -> Option<(u32, Option<String>)> {
    let rest = line.strip_prefix("l.")?;
    let line_number = leading_u32(rest)?;
    let context = rest.trim_start_matches(|c: char| c.is_ascii_digit());
    Some((line_number, last_command(context)))
}

/// Attach a location to the most recent unlocated error, naming the offending
/// command when the error is an undefined control sequence.
fn attach_location(diagnostics: &mut [Diagnostic], line_number: u32, command: Option<String>) {
    for diagnostic in diagnostics.iter_mut().rev() {
        if diagnostic.severity == Severity::Error && diagnostic.line.is_none() {
            diagnostic.line = Some(line_number);
            if diagnostic.kind == DiagnosticKind::UndefinedControlSequence {
                if let Some(command) = command {
                    diagnostic.message = format!("Undefined control sequence {command}");
                }
            }
            return;
        }
    }
}

/// Recognise a `LaTeX Warning:` or `Package … Warning:` line.
fn parse_warning_line(line: &str) -> Option<Diagnostic> {
    if let Some(rest) = latex_warning_body(line) {
        let (kind, message) = classify_latex_warning(rest);
        return Some(Diagnostic::new(kind, message, None, input_line(rest)));
    }
    if let Some(rest) = package_warning_body(line) {
        return Some(Diagnostic::new(
            classify_package_warning(rest),
            clean(rest),
            None,
            input_line(rest),
        ));
    }
    None
}

/// The text after `LaTeX Warning: `, if the line carries it.
fn latex_warning_body(line: &str) -> Option<&str> {
    let marker = "LaTeX Warning: ";
    line.find(marker).map(|at| &line[at + marker.len()..])
}

/// The message after `Package <name> Warning: `, if the line is one.
fn package_warning_body(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("Package ")?;
    let marker = " Warning: ";
    let at = rest.find(marker)?;
    Some(&rest[at + marker.len()..])
}

/// Sub-classify a LaTeX warning body into a reference, citation, rerun, empty
/// bibliography, or generic kind.
fn classify_latex_warning(rest: &str) -> (DiagnosticKind, String) {
    let message = clean(rest);
    if rest.starts_with("Reference ") && rest.contains("undefined") {
        return (DiagnosticKind::UndefinedReference, message);
    }
    if rest.starts_with("Citation ") && rest.contains("undefined") {
        return (DiagnosticKind::UndefinedCitation, message);
    }
    if rest.contains("thebibliography") {
        return (DiagnosticKind::EmptyBibliography, message);
    }
    if mentions_rerun(rest) {
        return (DiagnosticKind::RerunNeeded, message);
    }
    (DiagnosticKind::LatexWarning, message)
}

/// Sub-classify a `Package … Warning:` body. `inputenc`'s no-op note and any
/// "rerun" request get their own actionable kinds; everything else is generic.
fn classify_package_warning(rest: &str) -> DiagnosticKind {
    if rest.contains("ignored with utf8") {
        return DiagnosticKind::InputencIgnored;
    }
    if mentions_rerun(rest) {
        return DiagnosticKind::RerunNeeded;
    }
    DiagnosticKind::PackageWarning
}

/// Whether a warning body asks for another compile pass — TeX phrases this as
/// "Rerun to get …" or "Please rerun …", so match case-insensitively.
fn mentions_rerun(text: &str) -> bool {
    text.to_ascii_lowercase().contains("rerun")
}

/// Recognise an `Overfull`/`Underfull` bad-box line, carrying its first line.
fn parse_badbox_line(line: &str) -> Option<Diagnostic> {
    let kind = if line.starts_with("Overfull \\") {
        DiagnosticKind::OverfullBox
    } else if line.starts_with("Underfull \\") {
        DiagnosticKind::UnderfullBox
    } else {
        return None;
    };
    Some(Diagnostic::new(kind, clean(line), None, at_line(line)))
}

/// Trim surrounding whitespace and any trailing full stops from a message.
fn clean(message: &str) -> String {
    message.trim().trim_end_matches('.').trim_end().to_string()
}

/// The leading run of ASCII digits parsed as a `u32`, if there is one.
fn leading_u32(text: &str) -> Option<u32> {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u32>().ok()
}

/// The number after `on input line `, if present.
fn input_line(text: &str) -> Option<u32> {
    let marker = "on input line ";
    match text.find(marker) {
        Some(at) => leading_u32(&text[at + marker.len()..]),
        None => None,
    }
}

/// The first line number after `at lines ` / `at line `, if present.
fn at_line(text: &str) -> Option<u32> {
    for marker in ["at lines ", "at line "] {
        if let Some(at) = text.find(marker) {
            return leading_u32(&text[at + marker.len()..]);
        }
    }
    None
}

/// The text quoted between a backtick and an apostrophe, as TeX names files and
/// keys (`` `missing.sty' ``).
fn quoted(text: &str) -> Option<String> {
    let open = text.find('`')?;
    let rest = &text[open + 1..];
    rest.find('\'').map(|close| rest[..close].to_string())
}

/// Whether a byte may appear in a TeX control-word name.
fn is_command_byte(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'@'
}

/// The last `\command` token in `text`, if any — the offending control sequence
/// on a `l.<n>` context line is the final one before the break.
fn last_command(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut found = None;
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let mut end = i + 1;
            while end < bytes.len() && is_command_byte(bytes[end]) {
                end += 1;
            }
            if end > i + 1 {
                found = Some(text[i..end].to_string());
                i = end;
                continue;
            }
        }
        i += 1;
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every diagnostic kind, for exhaustive metadata checks.
    const ALL_KINDS: [DiagnosticKind; 17] = [
        DiagnosticKind::UndefinedControlSequence,
        DiagnosticKind::MissingDollar,
        DiagnosticKind::RunawayArgument,
        DiagnosticKind::UnclosedEnvironment,
        DiagnosticKind::FileNotFound,
        DiagnosticKind::PackageError,
        DiagnosticKind::LatexError,
        DiagnosticKind::UndefinedReference,
        DiagnosticKind::UndefinedCitation,
        DiagnosticKind::RerunNeeded,
        DiagnosticKind::InputencIgnored,
        DiagnosticKind::EmptyBibliography,
        DiagnosticKind::LatexWarning,
        DiagnosticKind::PackageWarning,
        DiagnosticKind::OverfullBox,
        DiagnosticKind::UnderfullBox,
        DiagnosticKind::Style,
    ];

    /// The single diagnostic a one-problem log yields.
    fn only(log: &str) -> Diagnostic {
        let diagnostics = parse_log(log);
        assert_eq!(
            diagnostics.len(),
            1,
            "expected one diagnostic from: {log:?}"
        );
        diagnostics.into_iter().next().unwrap()
    }

    #[test]
    fn every_kind_has_distinct_metadata() {
        let mut labels = std::collections::BTreeSet::new();
        for kind in ALL_KINDS {
            assert!(labels.insert(kind.label()), "duplicate label: {kind:?}");
            assert!(!kind.explanation().is_empty());
            // Exercise the severity mapping for every kind.
            let _ = kind.severity();
        }
        assert_eq!(labels.len(), ALL_KINDS.len());
    }

    #[test]
    fn severities_have_stable_labels() {
        assert_eq!(Severity::Error.label(), "error");
        assert_eq!(Severity::Warning.label(), "warning");
        assert_eq!(Severity::BadBox.label(), "badbox");
    }

    #[test]
    fn lint_diagnostics_carry_their_own_severity() {
        // A ChkTeX warning: kind is Style, severity is the supplied Warning, and
        // the explanation is the standard style note.
        let warn = Diagnostic::lint(
            Severity::Warning,
            "Command terminated with space.".to_string(),
            None,
            Some(7),
        );
        assert_eq!(warn.kind, DiagnosticKind::Style);
        assert_eq!(warn.severity, Severity::Warning);
        assert_eq!(warn.message, "Command terminated with space.");
        assert_eq!(warn.line, Some(7));
        assert_eq!(warn.file, None);
        assert_eq!(warn.explanation, DiagnosticKind::Style.explanation());

        // The caller's severity wins, so a ChkTeX error overrides the kind's
        // default warning severity — and a file can be named.
        let err = Diagnostic::lint(
            Severity::Error,
            "Wrong length of dash.".to_string(),
            Some("main.tex".to_string()),
            None,
        );
        assert_eq!(err.severity, Severity::Error);
        assert_eq!(err.kind, DiagnosticKind::Style);
        assert_eq!(err.file.as_deref(), Some("main.tex"));
        assert_eq!(err.line, None);
        // The default style severity is Warning regardless of an override.
        assert_eq!(DiagnosticKind::Style.severity(), Severity::Warning);
        assert_eq!(DiagnosticKind::Style.label(), "style");
    }

    #[test]
    fn severity_groups_are_correct() {
        assert_eq!(
            DiagnosticKind::LatexError.severity(),
            Severity::Error,
            "errors group"
        );
        assert_eq!(
            DiagnosticKind::PackageWarning.severity(),
            Severity::Warning,
            "warnings group"
        );
        assert_eq!(
            DiagnosticKind::UnderfullBox.severity(),
            Severity::BadBox,
            "bad-box group"
        );
    }

    #[test]
    fn an_empty_log_has_no_diagnostics() {
        assert!(parse_log("").is_empty());
        // A log of only noise (banners, paths) yields nothing either.
        let noise = "This is pdfTeX, Version 3.14\n(./main.tex (/usr/share/texmf/x.sty))\n";
        assert!(parse_log(noise).is_empty());
    }

    #[test]
    fn detects_and_names_an_undefined_control_sequence() {
        let log = "! Undefined control sequence.\nl.6 \\documentclass\\foobar\n              {bar}";
        let diagnostic = only(log);
        assert_eq!(diagnostic.severity, Severity::Error);
        assert_eq!(diagnostic.kind, DiagnosticKind::UndefinedControlSequence);
        assert_eq!(diagnostic.message, "Undefined control sequence \\foobar");
        assert_eq!(diagnostic.line, Some(6));
        assert!(diagnostic.file.is_none());
        assert!(diagnostic.explanation.contains("command"));
    }

    #[test]
    fn an_undefined_control_sequence_without_a_named_command_keeps_its_line() {
        // The context line carries a number but no command token to name.
        let log = "! Undefined control sequence.\nl.10 plain context here";
        let diagnostic = only(log);
        assert_eq!(diagnostic.message, "Undefined control sequence");
        assert_eq!(diagnostic.line, Some(10));
    }

    #[test]
    fn detects_missing_math_mode() {
        let log = "! Missing $ inserted.\nl.4 \\alpha";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::MissingDollar);
        assert_eq!(diagnostic.line, Some(4));
        // A non-undefined-control-sequence error attaches its line without renaming.
        assert_eq!(diagnostic.message, "Missing $ inserted");
    }

    #[test]
    fn detects_a_runaway_argument_from_a_paragraph_end() {
        let log = "Runaway argument?\n! Paragraph ended before \\textbf was complete.\nl.8";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::RunawayArgument);
        assert_eq!(diagnostic.line, Some(8));
        assert!(diagnostic.message.starts_with("Paragraph ended before"));
    }

    #[test]
    fn detects_a_runaway_argument_from_a_scanning_end() {
        let log = "! File ended while scanning use of \\title.\nl.12";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::RunawayArgument);
        assert_eq!(diagnostic.line, Some(12));
    }

    #[test]
    fn detects_a_mismatched_environment() {
        let log = "! LaTeX Error: \\begin{itemize} on input line 5 ended by \\end{document}.\nl.20";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::UnclosedEnvironment);
        assert_eq!(diagnostic.severity, Severity::Error);
        assert_eq!(diagnostic.line, Some(20));
        assert!(diagnostic.file.is_none());
    }

    #[test]
    fn detects_a_missing_file_and_names_it() {
        let log = "! LaTeX Error: File `missing.sty' not found.\nl.3";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::FileNotFound);
        assert_eq!(diagnostic.file, Some("missing.sty".to_string()));
        assert_eq!(diagnostic.line, Some(3));
        assert!(diagnostic.message.contains("not found"));
    }

    #[test]
    fn detects_a_generic_latex_error() {
        let log = "! LaTeX Error: Something bad happened here.\nl.9";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::LatexError);
        assert_eq!(diagnostic.message, "Something bad happened here");
        assert_eq!(diagnostic.line, Some(9));
    }

    #[test]
    fn detects_a_plain_tex_error() {
        // A bare `! …` line that is neither a LaTeX nor a package error.
        let log = "! Too many }'s.\nl.15";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::LatexError);
        assert_eq!(diagnostic.message, "Too many }'s");
        assert_eq!(diagnostic.line, Some(15));
    }

    #[test]
    fn detects_a_package_error() {
        let log = "! Package inputenc Error: Unicode character ł not set up for use.\nl.2";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::PackageError);
        assert_eq!(diagnostic.message, "Unicode character ł not set up for use");
        assert_eq!(diagnostic.line, Some(2));
    }

    #[test]
    fn detects_an_undefined_reference_warning() {
        let log = "LaTeX Warning: Reference `fig:flow' on page 1 undefined on input line 42.";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::UndefinedReference);
        assert_eq!(diagnostic.severity, Severity::Warning);
        assert_eq!(diagnostic.line, Some(42));
    }

    #[test]
    fn detects_an_undefined_citation_warning() {
        let log = "LaTeX Warning: Citation `knuth84' on page 2 undefined on input line 7.";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::UndefinedCitation);
        assert_eq!(diagnostic.line, Some(7));
    }

    #[test]
    fn detects_a_generic_latex_warning() {
        let log = "LaTeX Warning: There were undefined references.";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::LatexWarning);
        // No `on input line`, so there is no line to report.
        assert!(diagnostic.line.is_none());
    }

    #[test]
    fn detects_a_package_warning() {
        let log = "Package hyperref Warning: Token not allowed in a PDF string on input line 99.";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::PackageWarning);
        assert_eq!(diagnostic.severity, Severity::Warning);
        assert_eq!(diagnostic.line, Some(99));
    }

    #[test]
    fn detects_a_rerun_request_from_latex_with_no_line() {
        // "Label(s) may have changed" carries no input line — but it is still an
        // actionable rerun note, and every panel entry can be expanded for detail.
        let log = "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::RerunNeeded);
        assert_eq!(diagnostic.severity, Severity::Warning);
        assert!(diagnostic.line.is_none());
        assert!(diagnostic.explanation.contains("compile once more"));
    }

    #[test]
    fn detects_a_rerun_request_from_a_package_with_a_line() {
        let log = "Package rerunfilecheck Warning: File `main.out' has changed. Rerun on input line 5.";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::RerunNeeded);
        assert_eq!(diagnostic.line, Some(5));
    }

    #[test]
    fn detects_the_inputenc_ignored_note() {
        let log = "Package inputenc Warning: inputenc package ignored with utf8 based engines.";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::InputencIgnored);
        assert_eq!(diagnostic.severity, Severity::Warning);
        assert!(diagnostic.line.is_none());
        assert!(diagnostic.explanation.contains("inputenc"));
    }

    #[test]
    fn detects_an_empty_bibliography_warning_with_its_line() {
        let log = "LaTeX Warning: Empty `thebibliography' environment on input line 3.";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::EmptyBibliography);
        assert_eq!(diagnostic.line, Some(3));
        assert!(diagnostic.explanation.contains("bibliography"));
    }

    #[test]
    fn a_plain_package_warning_is_not_mistaken_for_a_rerun() {
        // A package note without "rerun" stays a generic package warning.
        let log = "Package fancyhdr Warning: \\headheight is too small on input line 8.";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::PackageWarning);
    }

    #[test]
    fn detects_an_overfull_box_with_a_line_range() {
        let log = "Overfull \\hbox (15.38pt too wide) in paragraph at lines 12--14";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::OverfullBox);
        assert_eq!(diagnostic.severity, Severity::BadBox);
        assert_eq!(diagnostic.line, Some(12));
    }

    #[test]
    fn detects_an_underfull_box_with_a_single_line() {
        let log =
            "Underfull \\vbox (badness 10000) has occurred while \\output is active at line 8";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::UnderfullBox);
        assert_eq!(diagnostic.line, Some(8));
    }

    #[test]
    fn a_badbox_without_a_line_is_still_reported() {
        let log = "Overfull \\vbox (badness 10000) has occurred while \\output is active";
        let diagnostic = only(log);
        assert_eq!(diagnostic.kind, DiagnosticKind::OverfullBox);
        assert!(diagnostic.line.is_none());
    }

    #[test]
    fn a_location_line_with_no_pending_error_is_ignored() {
        // `l.5` with nothing to attach to, plus a located error then a bad box,
        // so the scan skips an already-located error and a non-error before
        // giving up — exercising every branch of the attach loop.
        let log = "! Undefined control sequence.\nl.5 \\foo\n\
                   Overfull \\hbox (1pt too wide) in paragraph at lines 6--7\nl.9 \\bar";
        let diagnostics = parse_log(log);
        assert_eq!(diagnostics.len(), 2);
        assert_eq!(
            diagnostics[0].kind,
            DiagnosticKind::UndefinedControlSequence
        );
        assert_eq!(diagnostics[0].line, Some(5));
        assert_eq!(diagnostics[1].kind, DiagnosticKind::OverfullBox);
        // The trailing `l.9` found no unlocated error to attach to.
        assert_eq!(diagnostics[1].line, Some(6));
    }

    #[test]
    fn parses_a_full_log_with_several_problems_in_order() {
        let log = "This is pdfTeX, Version 3.141592653\n\
                   (./main.tex\n\
                   ! Undefined control sequence.\n\
                   l.6 \\sectoin\n\
                            {Intro}\n\
                   LaTeX Warning: Reference `eq:1' undefined on input line 9.\n\
                   Overfull \\hbox (5.0pt too wide) in paragraph at lines 11--12\n\
                   Package biblatex Warning: Please rerun on input line 20.\n\
                   )";
        let diagnostics = parse_log(log);
        let kinds: Vec<DiagnosticKind> = diagnostics.iter().map(|d| d.kind).collect();
        assert_eq!(
            kinds,
            vec![
                DiagnosticKind::UndefinedControlSequence,
                DiagnosticKind::UndefinedReference,
                DiagnosticKind::OverfullBox,
                // "Please rerun …" is now recognised as an actionable rerun note.
                DiagnosticKind::RerunNeeded,
            ]
        );
        assert_eq!(
            diagnostics[0].message,
            "Undefined control sequence \\sectoin"
        );
        assert_eq!(diagnostics[0].line, Some(6));
        assert_eq!(diagnostics[1].line, Some(9));
        assert_eq!(diagnostics[2].line, Some(11));
        assert_eq!(diagnostics[3].line, Some(20));
    }

    #[test]
    fn helper_parse_location_line_needs_the_prefix_and_a_number() {
        assert_eq!(
            parse_location_line("l.6 \\foo"),
            Some((6, Some("\\foo".to_string())))
        );
        // Starts with `l.` but no number follows — not a location line.
        assert_eq!(parse_location_line("l.hand side"), None);
        // No `l.` prefix at all.
        assert_eq!(parse_location_line("not a location"), None);
    }

    #[test]
    fn helper_clean_trims_space_and_trailing_dots() {
        assert_eq!(clean("  hello.  "), "hello");
        assert_eq!(clean("no trailing dot"), "no trailing dot");
        assert_eq!(clean("ellipsis..."), "ellipsis");
    }

    #[test]
    fn helper_leading_u32_handles_digits_text_and_overflow() {
        assert_eq!(leading_u32("42 rest"), Some(42));
        assert_eq!(leading_u32("none"), None);
        // Wider than u32 — the parse fails and yields None.
        assert_eq!(leading_u32("99999999999999999999"), None);
    }

    #[test]
    fn helper_input_line_reads_the_trailing_number() {
        assert_eq!(input_line("undefined on input line 12."), Some(12));
        // The marker is present but no number follows it.
        assert_eq!(input_line("on input line ."), None);
        assert_eq!(input_line("no marker here"), None);
    }

    #[test]
    fn helper_at_line_reads_plural_and_singular_forms() {
        assert_eq!(at_line("at lines 3--5"), Some(3));
        assert_eq!(at_line("detected at line 7"), Some(7));
        assert_eq!(at_line("no line marker"), None);
    }

    #[test]
    fn helper_quoted_extracts_backtick_apostrophe_text() {
        assert_eq!(quoted("File `a.sty' not found"), Some("a.sty".to_string()));
        assert_eq!(quoted("no quotes here"), None);
        assert_eq!(quoted("open `but never closed"), None);
    }

    #[test]
    fn helper_package_error_needs_both_markers() {
        assert_eq!(package_error("Package x Error: boom"), Some("boom"));
        assert_eq!(package_error("Not a package line"), None);
        assert_eq!(package_error("Package x Warning: not an error"), None);
    }

    #[test]
    fn helper_package_warning_body_needs_both_markers() {
        assert_eq!(
            package_warning_body("Package x Warning: note"),
            Some("note")
        );
        assert_eq!(package_warning_body("Other line"), None);
        assert_eq!(package_warning_body("Package x Info: not a warning"), None);
    }

    #[test]
    fn helper_last_command_finds_the_final_token() {
        assert_eq!(last_command("\\foo bar \\baz"), Some("\\baz".to_string()));
        // A lone backslash names no command; an internal `@` is part of one.
        assert_eq!(last_command("a \\ b"), None);
        assert_eq!(
            last_command("text \\my@macro"),
            Some("\\my@macro".to_string())
        );
        assert_eq!(last_command("nothing here"), None);
        // A command sitting at the very end of the string.
        assert_eq!(last_command("trailing \\end"), Some("\\end".to_string()));
    }

    #[test]
    fn diagnostic_supports_its_derives() {
        let diagnostic = Diagnostic::new(
            DiagnosticKind::LatexError,
            "boom".to_string(),
            Some("a.tex".to_string()),
            Some(3),
        );
        assert_eq!(diagnostic.clone(), diagnostic);
        assert!(format!("{diagnostic:?}").contains("Diagnostic"));

        // Severity / kind are Copy + Eq + Debug.
        let severity = Severity::Warning;
        let copied = severity;
        assert_eq!(copied, severity);
        assert_ne!(Severity::Error, Severity::BadBox);
        assert_eq!(format!("{severity:?}"), "Warning");

        let kind = DiagnosticKind::MissingDollar;
        let kind_copy = kind;
        assert_eq!(kind_copy, kind);
        assert_ne!(DiagnosticKind::FileNotFound, DiagnosticKind::PackageError);
        assert!(format!("{kind:?}").contains("MissingDollar"));
    }
}
