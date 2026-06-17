//! Galley core domain: pure, I/O-free types shared across the app.
//!
//! This crate is the framework-agnostic heart of Galley. It deliberately has no
//! dependency on a GUI, filesystem, network, or TeX installation, so it can be
//! exercised to full coverage with plain unit tests. As the product grows, the
//! richer domain types (`Project`, `Document`, `BuildPlan`, …) live here too.

pub mod compile;
pub mod document;
pub mod manifest;
pub mod project;
pub mod time;

pub use compile::{
    tex_job_name, BuildPlan, CompileReport, CompileRequest, CompileResult, CompileStatus, Compiler,
    Engine, PlanError,
};
pub use document::{
    basename, classify, is_main_named, looks_like_root, select_root_document, Document,
    DocumentKind, RootCandidate,
};
pub use manifest::{Manifest, ManifestError, MANIFEST_PATH};
pub use project::{project_name_from_path, Project};
pub use time::iso8601_utc;

/// Product name, as shown in the UI and the window title.
pub const NAME: &str = "Galley";

/// Product tagline.
pub const TAGLINE: &str = "Pull a proof.";

/// The current Galley version, taken straight from the crate's Cargo metadata.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// A semantic version of the form `MAJOR.MINOR.PATCH`.
///
/// This intentionally omits pre-release and build metadata; Galley's own
/// releases never use them, and keeping the type small keeps it total.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct SemVer {
    /// Major version — incremented for incompatible changes.
    pub major: u64,
    /// Minor version — incremented for backwards-compatible features.
    pub minor: u64,
    /// Patch version — incremented for backwards-compatible fixes.
    pub patch: u64,
}

/// The reason a string could not be parsed as a [`SemVer`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParseError {
    /// The input did not contain exactly three dot-separated parts.
    WrongPartCount,
    /// A part was not a non-negative integer.
    NotANumber,
}

impl core::fmt::Display for ParseError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let msg = match self {
            ParseError::WrongPartCount => "expected MAJOR.MINOR.PATCH",
            ParseError::NotANumber => "version parts must be non-negative integers",
        };
        f.write_str(msg)
    }
}

impl std::error::Error for ParseError {}

impl SemVer {
    /// Construct a version from its components.
    #[must_use]
    pub const fn new(major: u64, minor: u64, patch: u64) -> Self {
        Self {
            major,
            minor,
            patch,
        }
    }

    /// Parse a `MAJOR.MINOR.PATCH` string.
    ///
    /// # Errors
    ///
    /// Returns [`ParseError::WrongPartCount`] if there are not exactly three
    /// parts, or [`ParseError::NotANumber`] if a part is not a `u64`.
    pub fn parse(s: &str) -> Result<Self, ParseError> {
        let mut parts = s.split('.');
        let major = take_number(&mut parts)?;
        let minor = take_number(&mut parts)?;
        let patch = take_number(&mut parts)?;
        if parts.next().is_some() {
            return Err(ParseError::WrongPartCount);
        }
        Ok(Self::new(major, minor, patch))
    }
}

fn take_number(parts: &mut core::str::Split<'_, char>) -> Result<u64, ParseError> {
    let raw = parts.next().ok_or(ParseError::WrongPartCount)?;
    raw.parse::<u64>().map_err(|_| ParseError::NotANumber)
}

impl core::fmt::Display for SemVer {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brand_constants_are_set() {
        assert_eq!(NAME, "Galley");
        assert_eq!(TAGLINE, "Pull a proof.");
        // VERSION must itself be valid semver and match the crate version.
        assert!(SemVer::parse(VERSION).is_ok());
    }

    #[test]
    fn parses_a_well_formed_version() {
        assert_eq!(SemVer::parse("1.2.3"), Ok(SemVer::new(1, 2, 3)));
        assert_eq!(SemVer::parse("0.0.1"), Ok(SemVer::new(0, 0, 1)));
    }

    #[test]
    fn rejects_too_few_parts() {
        assert_eq!(SemVer::parse("1.2"), Err(ParseError::WrongPartCount));
        assert_eq!(SemVer::parse(""), Err(ParseError::NotANumber));
    }

    #[test]
    fn rejects_too_many_parts() {
        assert_eq!(SemVer::parse("1.2.3.4"), Err(ParseError::WrongPartCount));
    }

    #[test]
    fn rejects_non_numeric_parts() {
        assert_eq!(SemVer::parse("1.x.3"), Err(ParseError::NotANumber));
        assert_eq!(SemVer::parse("a.b.c"), Err(ParseError::NotANumber));
        assert_eq!(SemVer::parse("1.-1.0"), Err(ParseError::NotANumber));
    }

    #[test]
    fn displays_in_canonical_form() {
        assert_eq!(SemVer::new(2, 5, 9).to_string(), "2.5.9");
    }

    #[test]
    fn parse_error_messages_are_distinct() {
        assert_eq!(
            ParseError::WrongPartCount.to_string(),
            "expected MAJOR.MINOR.PATCH"
        );
        assert_eq!(
            ParseError::NotANumber.to_string(),
            "version parts must be non-negative integers"
        );
        // Exercise the std::error::Error impl.
        let err: &dyn std::error::Error = &ParseError::NotANumber;
        assert!(err.source().is_none());
    }

    #[test]
    fn orders_and_compares_versions() {
        let a = SemVer::new(1, 0, 0);
        let b = SemVer::new(1, 2, 0);
        assert!(a < b);
        assert_ne!(a, b);
        // Distinct bindings exercise PartialEq without tripping clippy::eq_op.
        assert_eq!(SemVer::new(1, 0, 0), a);
        // Exercise the derived Debug together with Copy.
        let copied = a;
        assert_eq!(
            format!("{copied:?}"),
            "SemVer { major: 1, minor: 0, patch: 0 }"
        );
    }

    #[test]
    fn parse_error_derives_are_usable() {
        let e = ParseError::WrongPartCount;
        // Distinct bindings exercise PartialEq without tripping clippy::eq_op.
        assert_eq!(ParseError::WrongPartCount, e);
        assert_ne!(ParseError::NotANumber, e);
        assert_eq!(format!("{e:?}"), "WrongPartCount");
        let copied = e;
        assert_eq!(copied, e);
    }
}
