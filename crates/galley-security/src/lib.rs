//! Galley security primitives.
//!
//! For v0.0.3 this crate provides [`SafeRoot`], a filesystem store that is
//! confined to a single project directory. Every read, write, and listing is
//! constrained to the project root: relative paths that try to climb out with
//! `..`, absolute paths, and symlinks that resolve outside the root are all
//! refused. This is the `FileStore` port from the architecture (ADR-0002): the
//! Tauri command layer never touches the filesystem directly, it goes through a
//! `SafeRoot`.
//!
//! Later releases add the OS-keychain secret store and the compile/import
//! sandbox policy here too.

use std::ffi::OsStr;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

/// A filesystem store rooted at, and confined to, a single project directory.
///
/// The root is canonicalised on construction, and every operation resolves its
/// target and verifies it stays inside that canonical root, so no operation can
/// reach outside the project.
#[derive(Debug, Clone)]
pub struct SafeRoot {
    root: PathBuf,
}

/// Why a [`SafeRoot`] operation was refused.
#[derive(Debug)]
pub enum SandboxError {
    /// The relative path was empty (or only separators).
    Empty,
    /// An absolute path was given where a project-relative one was required.
    Absolute,
    /// The path used `..`, `.`, or a backslash separator.
    Traversal,
    /// The path resolved (via a symlink) outside the project root.
    Escape,
    /// The project root is not a directory.
    NotADirectory,
    /// An underlying filesystem error.
    Io(io::Error),
}

impl fmt::Display for SandboxError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SandboxError::Empty => f.write_str("the path is empty"),
            SandboxError::Absolute => {
                f.write_str("absolute paths are not allowed inside a project")
            }
            SandboxError::Traversal => {
                f.write_str("the path tries to leave the project with `.`, `..`, or `\\`")
            }
            SandboxError::Escape => f.write_str("the path resolves outside the project root"),
            SandboxError::NotADirectory => f.write_str("the project root is not a directory"),
            SandboxError::Io(err) => write!(f, "filesystem error: {err}"),
        }
    }
}

impl std::error::Error for SandboxError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            SandboxError::Io(err) => Some(err),
            _ => None,
        }
    }
}

impl SafeRoot {
    /// Open a project root, canonicalising it and checking it is a directory.
    ///
    /// # Errors
    ///
    /// Returns [`SandboxError::Io`] if the path cannot be canonicalised (for
    /// example, it does not exist) and [`SandboxError::NotADirectory`] if it is
    /// not a directory.
    pub fn open(root: &Path) -> Result<Self, SandboxError> {
        let canonical = fs::canonicalize(root).map_err(SandboxError::Io)?;
        if !canonical.is_dir() {
            return Err(SandboxError::NotADirectory);
        }
        Ok(Self { root: canonical })
    }

    /// Build a `SafeRoot` from an already-canonical directory, skipping the
    /// filesystem checks. Callers must pass a path they have just created or
    /// canonicalised under a canonical parent.
    #[must_use]
    pub fn from_canonical(root: PathBuf) -> Self {
        Self { root }
    }

    /// The canonical project root.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Read a project-relative file to a string.
    ///
    /// # Errors
    ///
    /// Returns a [`SandboxError`] if the path is invalid, resolves outside the
    /// root, or cannot be read.
    pub fn read(&self, rel: &str) -> Result<String, SandboxError> {
        let target = self.resolve(rel)?;
        let canonical = fs::canonicalize(&target).map_err(SandboxError::Io)?;
        if !canonical.starts_with(&self.root) {
            return Err(SandboxError::Escape);
        }
        fs::read_to_string(&canonical).map_err(SandboxError::Io)
    }

    /// Read a project-relative file to a byte vector.
    ///
    /// Identical to [`read`] but returns raw bytes, so binary files (images,
    /// PDFs) are preserved exactly.
    ///
    /// # Errors
    ///
    /// Returns a [`SandboxError`] if the path is invalid, resolves outside the
    /// root, or cannot be read.
    pub fn read_bytes(&self, rel: &str) -> Result<Vec<u8>, SandboxError> {
        let target = self.resolve(rel)?;
        let canonical = fs::canonicalize(&target).map_err(SandboxError::Io)?;
        if !canonical.starts_with(&self.root) {
            return Err(SandboxError::Escape);
        }
        fs::read(&canonical).map_err(SandboxError::Io)
    }

    /// Write a project-relative file, creating parent directories as needed.
    ///
    /// Writing through a symlink (final component or any parent) is refused.
    ///
    /// # Errors
    ///
    /// Returns a [`SandboxError`] if the path is invalid, resolves outside the
    /// root, or cannot be written.
    pub fn write(&self, rel: &str, contents: &str) -> Result<(), SandboxError> {
        let parts = self.parts(rel)?;
        let dir_parts = &parts[..parts.len() - 1];
        self.assert_within(dir_parts)?;

        let mut parent = self.root.clone();
        for part in dir_parts {
            parent.push(part);
        }
        fs::create_dir_all(&parent).map_err(SandboxError::Io)?;

        let mut target = parent;
        target.push(parts[parts.len() - 1]);
        match fs::symlink_metadata(&target) {
            Ok(meta) if meta.file_type().is_symlink() => return Err(SandboxError::Escape),
            _ => {}
        }
        fs::write(&target, contents).map_err(SandboxError::Io)
    }

    /// Write binary content to a project-relative file, creating parent directories as needed.
    ///
    /// Identical to [`write`] but accepts arbitrary bytes — useful for copying
    /// images and other binary assets into the project. Writing through a symlink
    /// (final component or any parent) is refused.
    ///
    /// # Errors
    ///
    /// Returns a [`SandboxError`] if the path is invalid, resolves outside the
    /// root, or cannot be written.
    pub fn write_bytes(&self, rel: &str, contents: &[u8]) -> Result<(), SandboxError> {
        let parts = self.parts(rel)?;
        let dir_parts = &parts[..parts.len() - 1];
        self.assert_within(dir_parts)?;

        let mut parent = self.root.clone();
        for part in dir_parts {
            parent.push(part);
        }
        fs::create_dir_all(&parent).map_err(SandboxError::Io)?;

        let mut target = parent;
        target.push(parts[parts.len() - 1]);
        match fs::symlink_metadata(&target) {
            Ok(meta) if meta.file_type().is_symlink() => return Err(SandboxError::Escape),
            _ => {}
        }
        fs::write(&target, contents).map_err(SandboxError::Io)
    }

    /// List every file in the project (recursively), excluding the `.galley/`
    /// metadata directory and never following symlinks. Paths are returned
    /// project-relative, forward-slashed, and sorted.
    ///
    /// # Errors
    ///
    /// Returns [`SandboxError::Io`] if a directory cannot be read.
    pub fn list(&self) -> Result<Vec<String>, SandboxError> {
        let mut out = Vec::new();
        self.walk(&self.root, "", &mut out)?;
        out.sort();
        Ok(out)
    }

    /// Resolve a project-relative path to an absolute path under the root,
    /// rejecting traversal but not yet touching the filesystem.
    fn resolve(&self, rel: &str) -> Result<PathBuf, SandboxError> {
        let parts = self.parts(rel)?;
        let mut path = self.root.clone();
        for part in &parts {
            path.push(part);
        }
        Ok(path)
    }

    /// Validate and split a relative path into its components.
    fn parts<'a>(&self, rel: &'a str) -> Result<Vec<&'a str>, SandboxError> {
        if rel.contains('\\') {
            return Err(SandboxError::Traversal);
        }
        if Path::new(rel).is_absolute() {
            return Err(SandboxError::Absolute);
        }
        let parts: Vec<&str> = rel
            .split('/')
            .filter(|segment| !segment.is_empty())
            .collect();
        if parts.is_empty() {
            return Err(SandboxError::Empty);
        }
        for part in &parts {
            if *part == "." || *part == ".." {
                return Err(SandboxError::Traversal);
            }
        }
        Ok(parts)
    }

    /// Walk existing ancestor directories and ensure none of them is a symlink
    /// that resolves outside the root. Stops at the first component that does
    /// not exist yet (nothing below it can exist either).
    fn assert_within(&self, dir_parts: &[&str]) -> Result<(), SandboxError> {
        let mut path = self.root.clone();
        for part in dir_parts {
            path.push(part);
            match fs::canonicalize(&path) {
                Ok(canonical) => {
                    if !canonical.starts_with(&self.root) {
                        return Err(SandboxError::Escape);
                    }
                }
                Err(_) => break,
            }
        }
        Ok(())
    }

    fn walk(&self, dir: &Path, prefix: &str, out: &mut Vec<String>) -> Result<(), SandboxError> {
        let entries = fs::read_dir(dir).map_err(SandboxError::Io)?;
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name == *OsStr::new(".galley") {
                continue;
            }
            let name = name.to_string_lossy();
            let rel = if prefix.is_empty() {
                name.into_owned()
            } else {
                format!("{prefix}/{name}")
            };
            let path = entry.path();
            if path.is_symlink() {
                continue;
            }
            if path.is_dir() {
                self.walk(&path, &rel, out)?;
            } else {
                out.push(rel);
            }
        }
        Ok(())
    }
}

/// Whether `rel` is a clean, project-relative path (no traversal/absolute/`\\`).
/// A small pure helper for callers that want to validate without an open
/// project on hand.
#[must_use]
pub fn is_safe_relative(rel: &str) -> bool {
    if rel.contains('\\') || Path::new(rel).is_absolute() {
        return false;
    }
    let mut any = false;
    for component in Path::new(rel).components() {
        match component {
            Component::Normal(_) => any = true,
            _ => return false,
        }
    }
    any
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use tempfile::TempDir;

    fn temp() -> (TempDir, SafeRoot) {
        let dir = TempDir::new().unwrap();
        let store = SafeRoot::open(dir.path()).unwrap();
        (dir, store)
    }

    /// A stable tag for an error variant, so tests can assert with `assert_eq!`
    /// (which keeps coverage honest) rather than `matches!` (whose never-taken
    /// arm shows as an uncovered region).
    fn tag(err: &SandboxError) -> &'static str {
        match err {
            SandboxError::Empty => "empty",
            SandboxError::Absolute => "absolute",
            SandboxError::Traversal => "traversal",
            SandboxError::Escape => "escape",
            SandboxError::NotADirectory => "not-a-directory",
            SandboxError::Io(_) => "io",
        }
    }

    #[test]
    fn writes_reads_and_lists_a_multi_file_project() {
        let (_dir, store) = temp();
        store.write("main.tex", "\\documentclass{article}").unwrap();
        store.write("chapters/intro.tex", "intro").unwrap();
        // A second file in an existing subdirectory: the within-root ancestor check.
        store.write("chapters/methods.tex", "methods").unwrap();
        store.write("refs.bib", "@book{}").unwrap();
        // `.galley/` metadata is written but never listed.
        store.write(".galley/project.toml", "name = \"x\"").unwrap();

        assert_eq!(store.read("main.tex").unwrap(), "\\documentclass{article}");
        assert_eq!(store.read("chapters/intro.tex").unwrap(), "intro");
        assert_eq!(
            store.list().unwrap(),
            vec![
                "chapters/intro.tex".to_string(),
                "chapters/methods.tex".to_string(),
                "main.tex".to_string(),
                "refs.bib".to_string(),
            ]
        );
        // Overwriting an existing regular file is fine (non-symlink branch).
        store.write("main.tex", "changed").unwrap();
        assert_eq!(store.read("main.tex").unwrap(), "changed");
    }

    #[test]
    fn rejects_invalid_relative_paths() {
        let (_dir, store) = temp();
        assert_eq!(tag(&store.read("").unwrap_err()), "empty");
        assert_eq!(tag(&store.read("/etc/passwd").unwrap_err()), "absolute");
        assert_eq!(tag(&store.read("../escape").unwrap_err()), "traversal");
        assert_eq!(tag(&store.read("./here").unwrap_err()), "traversal");
        assert_eq!(tag(&store.read("a\\b").unwrap_err()), "traversal");
        assert_eq!(tag(&store.write("..", "x").unwrap_err()), "traversal");
    }

    #[test]
    fn reading_a_missing_file_or_a_directory_errors() {
        let (_dir, store) = temp();
        assert_eq!(tag(&store.read("nope.tex").unwrap_err()), "io");
        store.write("sub/x.tex", "x").unwrap();
        // `sub` is a directory, not a readable file.
        assert_eq!(tag(&store.read("sub").unwrap_err()), "io");
    }

    #[test]
    fn open_requires_an_existing_directory() {
        let dir = TempDir::new().unwrap();
        assert_eq!(
            tag(&SafeRoot::open(&dir.path().join("missing")).unwrap_err()),
            "io"
        );
        let file = dir.path().join("file.tex");
        fs::write(&file, "x").unwrap();
        assert_eq!(tag(&SafeRoot::open(&file).unwrap_err()), "not-a-directory");
    }

    #[test]
    fn writing_through_a_bad_parent_or_target_errors() {
        let (_dir, store) = temp();
        // Parent path runs through a regular file → cannot create the directory.
        store.write("file", "x").unwrap();
        assert_eq!(tag(&store.write("file/child.tex", "y").unwrap_err()), "io");
        // Target is an existing directory → cannot write a file over it.
        store.write("dir/keep.tex", "k").unwrap();
        assert_eq!(tag(&store.write("dir", "y").unwrap_err()), "io");
    }

    #[test]
    fn refuses_to_read_or_write_through_a_symlink_that_escapes() {
        let outside = TempDir::new().unwrap();
        let secret = outside.path().join("secret.txt");
        fs::write(&secret, "top secret").unwrap();
        let outside_dir = outside.path().join("outdir");
        fs::create_dir(&outside_dir).unwrap();

        let (dir, store) = temp();
        // A symlinked file pointing outside the root.
        symlink(&secret, dir.path().join("leak.tex")).unwrap();
        assert_eq!(tag(&store.read("leak.tex").unwrap_err()), "escape");
        // Writing onto that symlink is refused (final-component symlink).
        assert_eq!(tag(&store.write("leak.tex", "x").unwrap_err()), "escape");

        // A symlinked directory pointing outside the root.
        symlink(&outside_dir, dir.path().join("out")).unwrap();
        assert_eq!(
            tag(&store.write("out/evil.tex", "x").unwrap_err()),
            "escape"
        );
        // The escaping symlink is not followed when listing.
        store.write("kept.tex", "k").unwrap();
        assert_eq!(store.list().unwrap(), vec!["kept.tex".to_string()]);
    }

    #[test]
    fn listing_propagates_an_unreadable_directory() {
        let (dir, store) = temp();
        store.write("readable.tex", "x").unwrap();
        let locked = dir.path().join("locked");
        fs::create_dir(&locked).unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

        let result = store.list();
        // Restore permissions so the TempDir can be cleaned up.
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(tag(&result.unwrap_err()), "io");
    }

    #[test]
    fn read_bytes_returns_exact_bytes_and_rejects_escape() {
        use std::os::unix::fs::symlink;
        let outside = TempDir::new().unwrap();
        let secret = outside.path().join("secret.bin");
        let data: &[u8] = &[0xCA, 0xFE, 0xBA, 0xBE];
        fs::write(&secret, data).unwrap();

        let (dir, store) = temp();
        store.write_bytes("binary.bin", data).unwrap();
        assert_eq!(store.read_bytes("binary.bin").unwrap(), data);

        // Missing file → io error.
        assert_eq!(tag(&store.read_bytes("missing.bin").unwrap_err()), "io");

        // Invalid relative path → sandbox error via resolve().
        assert_eq!(
            tag(&store.read_bytes("../escape").unwrap_err()),
            "traversal"
        );

        // Symlink escaping the root → escape error.
        symlink(&secret, dir.path().join("link.bin")).unwrap();
        assert_eq!(tag(&store.read_bytes("link.bin").unwrap_err()), "escape");
    }

    #[test]
    fn write_bytes_creates_binary_file_and_parents() {
        let (dir, store) = temp();
        let data: &[u8] = &[0x89, 0x50, 0x4e, 0x47]; // PNG magic
        store.write_bytes("assets/sub/logo.png", data).unwrap();
        let path = dir.path().join("assets/sub/logo.png");
        assert_eq!(fs::read(path).unwrap(), data);
    }

    #[test]
    fn write_bytes_rejects_traversal_and_bad_parent_and_dir_target() {
        let (_dir, store) = temp();
        assert_eq!(
            tag(&store.write_bytes("../x", &[]).unwrap_err()),
            "traversal"
        );
        // Parent path runs through a regular file.
        store.write_bytes("file", &[0]).unwrap();
        assert_eq!(
            tag(&store.write_bytes("file/img.png", &[1]).unwrap_err()),
            "io"
        );
        // Writing to an existing directory (non-symlink) fails.
        store.write_bytes("dir/f", &[0]).unwrap();
        assert_eq!(tag(&store.write_bytes("dir", &[1]).unwrap_err()), "io");
    }

    #[test]
    fn write_bytes_refuses_symlink_final_and_parent() {
        use std::os::unix::fs::symlink;
        let outside = TempDir::new().unwrap();
        let (dir, store) = temp();
        let outside_file = outside.path().join("secret");
        let outside_dir = outside.path().join("outdir");
        fs::write(&outside_file, "x").unwrap();
        fs::create_dir(&outside_dir).unwrap();
        // Final component is a symlink to an external file.
        symlink(&outside_file, dir.path().join("link.png")).unwrap();
        assert_eq!(
            tag(&store.write_bytes("link.png", &[1]).unwrap_err()),
            "escape"
        );
        // A parent directory is a symlink to an external directory.
        symlink(&outside_dir, dir.path().join("outdir")).unwrap();
        assert_eq!(
            tag(&store.write_bytes("outdir/img.png", &[1]).unwrap_err()),
            "escape"
        );
    }

    #[test]
    fn errors_display_and_chain() {
        assert_eq!(SandboxError::Empty.to_string(), "the path is empty");
        assert_eq!(
            SandboxError::Absolute.to_string(),
            "absolute paths are not allowed inside a project"
        );
        assert!(SandboxError::Traversal.to_string().contains("`..`"));
        assert_eq!(
            SandboxError::Escape.to_string(),
            "the path resolves outside the project root"
        );
        assert_eq!(
            SandboxError::NotADirectory.to_string(),
            "the project root is not a directory"
        );
        let io = SandboxError::Io(io::Error::other("boom"));
        assert!(io.to_string().contains("boom"));

        use std::error::Error;
        assert!(io.source().is_some());
        assert!(SandboxError::Empty.source().is_none());
        // Exercise the derives.
        assert!(format!("{:?}", SandboxError::Empty).contains("Empty"));
        let store = SafeRoot::from_canonical(PathBuf::from("/tmp"));
        assert!(format!("{:?}", store.clone()).contains("SafeRoot"));
        assert_eq!(store.root(), Path::new("/tmp"));
    }

    #[test]
    fn is_safe_relative_classifies_paths() {
        assert!(is_safe_relative("main.tex"));
        assert!(is_safe_relative("chapters/intro.tex"));
        assert!(!is_safe_relative(""));
        assert!(!is_safe_relative("/abs"));
        assert!(!is_safe_relative("a\\b"));
        assert!(!is_safe_relative("../up"));
        assert!(!is_safe_relative("./cur"));
    }
}
