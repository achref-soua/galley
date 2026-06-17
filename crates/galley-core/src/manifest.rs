//! The non-intrusive `.galley/project.toml` manifest.
//!
//! Galley keeps everything it needs for a project inside that project's
//! `.galley/` directory, and the manifest is the one file it writes there. The
//! manifest records a little metadata about the project and **never affects
//! compilation**, so deleting `.galley/` (or just the manifest) leaves a
//! perfectly good LaTeX project behind — the project still builds anywhere and
//! exports clean.
//!
//! The format is a deliberately tiny subset of TOML — `key = "value"` lines,
//! with `#` comments and blank lines ignored. Keeping it this small means the
//! manifest stays human-readable and hand-editable without pulling a general
//! TOML parser (and its supply-chain surface) into the otherwise dependency-free
//! core. See ADR-0005.

use core::fmt;

/// Relative path of the manifest within a project (always forward-slashed).
pub const MANIFEST_PATH: &str = ".galley/project.toml";

/// The metadata Galley keeps about a project in `.galley/project.toml`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Manifest {
    /// Human-facing project name (defaults to the folder name on import).
    pub name: String,
    /// When the manifest was first written, as an ISO-8601 UTC timestamp.
    pub created: String,
    /// The Galley version that wrote the manifest.
    pub galley_version: String,
    /// Project-relative path of the root document (`main.tex`, etc.); empty when
    /// no LaTeX root was detected.
    pub root_document: String,
}

/// Why a manifest string could not be parsed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManifestError {
    /// A required key was absent.
    MissingField(&'static str),
    /// A non-empty, non-comment line was not a `key = "value"` pair.
    Malformed,
}

impl fmt::Display for ManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ManifestError::MissingField(key) => write!(f, "manifest is missing `{key}`"),
            ManifestError::Malformed => f.write_str("manifest line is not `key = \"value\"`"),
        }
    }
}

impl std::error::Error for ManifestError {}

impl Manifest {
    /// Build a manifest from its parts.
    #[must_use]
    pub fn new(
        name: impl Into<String>,
        created: impl Into<String>,
        galley_version: impl Into<String>,
        root_document: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            created: created.into(),
            galley_version: galley_version.into(),
            root_document: root_document.into(),
        }
    }

    /// Render the manifest to its on-disk text form.
    #[must_use]
    pub fn render(&self) -> String {
        format!(
            "# Galley project metadata — safe to delete; it never affects compilation.\n\
             name = \"{}\"\n\
             created = \"{}\"\n\
             galley_version = \"{}\"\n\
             root_document = \"{}\"\n",
            escape(&self.name),
            escape(&self.created),
            escape(&self.galley_version),
            escape(&self.root_document),
        )
    }

    /// Parse a manifest from its on-disk text form.
    ///
    /// Blank lines and `#` comments are ignored, and unknown keys are skipped so
    /// a newer Galley's manifest still reads in an older one.
    ///
    /// # Errors
    ///
    /// Returns [`ManifestError::Malformed`] for a line that is not a quoted
    /// `key = "value"` pair, or [`ManifestError::MissingField`] when a required
    /// key is absent.
    pub fn parse(text: &str) -> Result<Self, ManifestError> {
        let mut name = None;
        let mut created = None;
        let mut version = None;
        let mut root = None;

        for raw in text.lines() {
            let line = raw.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let (key, value) = parse_kv(line)?;
            match key {
                "name" => name = Some(value),
                "created" => created = Some(value),
                "galley_version" => version = Some(value),
                "root_document" => root = Some(value),
                _ => {}
            }
        }

        Ok(Self {
            name: name.ok_or(ManifestError::MissingField("name"))?,
            created: created.ok_or(ManifestError::MissingField("created"))?,
            galley_version: version.ok_or(ManifestError::MissingField("galley_version"))?,
            root_document: root.ok_or(ManifestError::MissingField("root_document"))?,
        })
    }
}

/// Split a trimmed line into its key and unquoted value.
fn parse_kv(line: &str) -> Result<(&str, String), ManifestError> {
    let eq = line.find('=').ok_or(ManifestError::Malformed)?;
    let key = line[..eq].trim();
    let value = unquote(line[eq + 1..].trim()).ok_or(ManifestError::Malformed)?;
    Ok((key, value))
}

/// Escape a value for the manifest's quoted-string form.
fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Parse a `"…"` quoted string, undoing `\\` and `\"` escapes. Returns `None`
/// if the input is not a well-formed quoted string.
fn unquote(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    if bytes.len() < 2 || bytes[0] != b'"' || bytes[bytes.len() - 1] != b'"' {
        return None;
    }
    let mut out = String::new();
    let mut chars = s[1..s.len() - 1].chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            out.push(chars.next()?);
        } else {
            out.push(c);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_text() {
        let manifest = Manifest::new(
            "My \"Quoted\" Paper\\Draft",
            "2026-06-17T08:30:00Z",
            "0.0.3",
            "main.tex",
        );
        let text = manifest.render();
        assert!(text.starts_with("# Galley project metadata"));
        assert_eq!(Manifest::parse(&text), Ok(manifest));
    }

    #[test]
    fn ignores_comments_blank_lines_and_unknown_keys() {
        let text = "# a comment\n\nname = \"Thesis\"\nengine = \"tectonic\"\n\
             created = \"t\"\ngalley_version = \"0.0.3\"\nroot_document = \"thesis.tex\"\n";
        let manifest = Manifest::parse(text).unwrap();
        assert_eq!(manifest.name, "Thesis");
        assert_eq!(manifest.root_document, "thesis.tex");
    }

    #[test]
    fn reports_each_missing_field() {
        let full = "name = \"n\"\ncreated = \"c\"\ngalley_version = \"v\"\nroot_document = \"r\"\n";
        assert!(Manifest::parse(full).is_ok());
        for (drop, field) in [
            ("name = \"n\"\n", "name"),
            ("created = \"c\"\n", "created"),
            ("galley_version = \"v\"\n", "galley_version"),
            ("root_document = \"r\"\n", "root_document"),
        ] {
            let partial = full.replace(drop, "");
            assert_eq!(
                Manifest::parse(&partial),
                Err(ManifestError::MissingField(field))
            );
        }
    }

    #[test]
    fn rejects_malformed_lines() {
        // No `=` at all.
        assert_eq!(
            Manifest::parse("just-a-word\n"),
            Err(ManifestError::Malformed)
        );
        // Value is not quoted.
        assert_eq!(
            Manifest::parse("name = bare\n"),
            Err(ManifestError::Malformed)
        );
    }

    #[test]
    fn unquote_rejects_bad_quoting() {
        assert_eq!(unquote("\""), None); // too short
        assert_eq!(unquote("bar\""), None); // no leading quote
        assert_eq!(unquote("\"bar"), None); // no trailing quote
        assert_eq!(unquote("\"\\\""), None); // trailing backslash before the closing quote
        assert_eq!(unquote("\"ok\""), Some("ok".to_string()));
    }

    #[test]
    fn error_messages_are_distinct() {
        assert_eq!(
            ManifestError::MissingField("name").to_string(),
            "manifest is missing `name`"
        );
        assert_eq!(
            ManifestError::Malformed.to_string(),
            "manifest line is not `key = \"value\"`"
        );
        let err: &dyn std::error::Error = &ManifestError::Malformed;
        assert!(err.source().is_none());
        // Exercise the derives.
        let cloned = ManifestError::Malformed.clone();
        assert_eq!(cloned, ManifestError::Malformed);
        assert_ne!(ManifestError::Malformed, ManifestError::MissingField("x"));
        assert_eq!(format!("{cloned:?}"), "Malformed");
    }

    #[test]
    fn manifest_derives_are_usable() {
        let a = Manifest::new("n", "c", "v", "r");
        let b = a.clone();
        assert_eq!(a, b);
        assert_ne!(a, Manifest::new("other", "c", "v", "r"));
        assert!(format!("{a:?}").contains("Manifest"));
        assert_eq!(MANIFEST_PATH, ".galley/project.toml");
    }
}
