//! Creating Galley projects and opening existing ones from disk.
//!
//! This crate is the I/O seam between the pure domain ([`galley_core`]) and the
//! sandboxed filesystem ([`galley_security::SafeRoot`]). It can:
//!
//! * **create** a fresh project — a new directory with a starter `main.tex` and
//!   a `.galley/project.toml` manifest; and
//! * **open** an existing on-disk LaTeX folder (a minimal import) — scanning it,
//!   classifying its files, detecting the root document, and ensuring a
//!   manifest is present.
//!
//! Galley's only footprint in a project is the `.galley/` directory: it never
//! affects compilation and is safe to delete, so opening a folder simply
//! re-creates the manifest when it is missing. The fuller import wizard
//! (Overleaf, arXiv, engine detection) arrives in v0.6.1.

use galley_core::{
    is_main_named, looks_like_root, project_name_from_path, select_root_document, Document,
    DocumentKind, Manifest, Project, RootCandidate, MANIFEST_PATH,
};
use galley_security::{SafeRoot, SandboxError};
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// The starter document written into a freshly created project.
pub const STARTER_MAIN: &str = "\\documentclass{article}\n\n\\begin{document}\n\n\
     Hello from Galley. Pull a proof.\n\n\\end{document}\n";

/// A project paired with its location on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workspace {
    /// The canonical project root directory.
    pub root: PathBuf,
    /// The in-memory project.
    pub project: Project,
}

/// Why creating or opening a project failed.
#[derive(Debug)]
pub enum ImportError {
    /// The project name was empty or contained a path separator.
    InvalidName,
    /// A project already exists at the target location.
    AlreadyExists,
    /// A sandboxed filesystem operation was refused.
    Sandbox(SandboxError),
    /// An underlying filesystem error.
    Io(io::Error),
}

impl fmt::Display for ImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ImportError::InvalidName => {
                f.write_str("project name is empty or contains a path separator")
            }
            ImportError::AlreadyExists => f.write_str("a project already exists at that location"),
            ImportError::Sandbox(err) => write!(f, "project file error: {err}"),
            ImportError::Io(err) => write!(f, "filesystem error: {err}"),
        }
    }
}

impl std::error::Error for ImportError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ImportError::Sandbox(err) => Some(err),
            ImportError::Io(err) => Some(err),
            _ => None,
        }
    }
}

/// Create a new, empty project directory `name` inside `parent`, seeding it with
/// a starter `main.tex` and a `.galley/project.toml` manifest.
///
/// `version` and `created` are recorded verbatim in the manifest, so callers can
/// pass the running Galley version and the current time.
///
/// # Errors
///
/// Returns [`ImportError::InvalidName`] for an unusable name,
/// [`ImportError::AlreadyExists`] when the target already holds a project, and
/// an [`ImportError::Io`] / [`ImportError::Sandbox`] for filesystem failures.
pub fn create_project(
    parent: &Path,
    name: &str,
    version: &str,
    created: &str,
) -> Result<Workspace, ImportError> {
    let name = validate_name(name)?;
    let parent = fs::canonicalize(parent).map_err(ImportError::Io)?;
    let root = parent.join(name);
    fs::create_dir_all(&root).map_err(ImportError::Io)?;

    let store = SafeRoot::from_canonical(root.clone());
    if store.read(MANIFEST_PATH).is_ok() {
        return Err(ImportError::AlreadyExists);
    }

    store
        .write("main.tex", STARTER_MAIN)
        .map_err(ImportError::Sandbox)?;
    let manifest = Manifest::new(name, created, version, "main.tex");
    store
        .write(MANIFEST_PATH, &manifest.render())
        .map_err(ImportError::Sandbox)?;

    let project = Project::new(name, "main.tex", vec![Document::new("main.tex")]);
    Ok(Workspace { root, project })
}

/// Open an existing on-disk folder as a Galley project (a minimal import).
///
/// Scans the folder, classifies its files, detects the root document, and
/// ensures a manifest exists — re-creating it if `.galley/` was deleted, and
/// preserving the project name from a manifest that is already present.
///
/// # Errors
///
/// Returns an [`ImportError::Sandbox`] if the folder cannot be opened, listed,
/// or have its manifest written.
pub fn open_folder(path: &Path, version: &str, created: &str) -> Result<Workspace, ImportError> {
    let store = SafeRoot::open(path).map_err(ImportError::Sandbox)?;
    let files = store.list().map_err(ImportError::Sandbox)?;

    let mut candidates: Vec<RootCandidate> = Vec::new();
    let mut documents: Vec<Document> = Vec::new();
    for rel in &files {
        let doc = Document::new(rel.clone());
        if doc.kind == DocumentKind::Tex {
            if let Ok(content) = store.read(rel) {
                candidates.push(RootCandidate {
                    path: rel.clone(),
                    is_main_named: is_main_named(rel),
                    has_documentclass: looks_like_root(&content),
                });
            }
        }
        documents.push(doc);
    }
    let root_document = select_root_document(&candidates).unwrap_or_default();

    let name = match store.read(MANIFEST_PATH) {
        Ok(text) => Manifest::parse(&text)
            .map(|manifest| manifest.name)
            .unwrap_or_else(|_| project_name_from_path(store.root())),
        Err(_) => project_name_from_path(store.root()),
    };

    let manifest = Manifest::new(&name, created, version, &root_document);
    store
        .write(MANIFEST_PATH, &manifest.render())
        .map_err(ImportError::Sandbox)?;

    let project = Project::new(name, root_document, documents);
    Ok(Workspace {
        root: store.root().to_path_buf(),
        project,
    })
}

/// Reject project names that are empty or would escape their parent directory.
fn validate_name(name: &str) -> Result<&str, ImportError> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(ImportError::InvalidName);
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::TempDir;

    const VERSION: &str = "0.0.3";
    const NOW: &str = "2026-06-17T08:00:00Z";

    fn tag(err: &ImportError) -> &'static str {
        match err {
            ImportError::InvalidName => "invalid-name",
            ImportError::AlreadyExists => "already-exists",
            ImportError::Sandbox(_) => "sandbox",
            ImportError::Io(_) => "io",
        }
    }

    #[test]
    fn creates_a_project_with_starter_and_manifest() {
        let parent = TempDir::new().unwrap();
        let workspace = create_project(parent.path(), "Paper", VERSION, NOW).unwrap();
        assert_eq!(workspace.project.name, "Paper");
        assert_eq!(workspace.project.root_document, "main.tex");
        assert_eq!(workspace.project.documents, vec![Document::new("main.tex")]);

        let store = SafeRoot::open(&workspace.root).unwrap();
        assert!(store.read("main.tex").unwrap().contains("documentclass"));
        let manifest = Manifest::parse(&store.read(MANIFEST_PATH).unwrap()).unwrap();
        assert_eq!(manifest.name, "Paper");
        assert_eq!(manifest.created, NOW);
        assert_eq!(manifest.galley_version, VERSION);
    }

    #[test]
    fn create_validates_the_name() {
        let parent = TempDir::new().unwrap();
        for bad in ["", ".", "..", "a/b", "a\\b"] {
            assert_eq!(
                tag(&create_project(parent.path(), bad, VERSION, NOW).unwrap_err()),
                "invalid-name",
                "{bad}"
            );
        }
    }

    #[test]
    fn create_reports_a_missing_parent_or_bad_target() {
        let parent = TempDir::new().unwrap();
        // Parent does not exist → cannot canonicalise.
        assert_eq!(
            tag(&create_project(&parent.path().join("nope"), "p", VERSION, NOW).unwrap_err()),
            "io"
        );
        // Parent is a file → cannot create the project directory under it.
        let file = parent.path().join("file");
        fs::write(&file, "x").unwrap();
        assert_eq!(
            tag(&create_project(&file, "p", VERSION, NOW).unwrap_err()),
            "io"
        );
    }

    #[test]
    fn create_refuses_to_clobber_an_existing_project() {
        let parent = TempDir::new().unwrap();
        create_project(parent.path(), "p", VERSION, NOW).unwrap();
        assert_eq!(
            tag(&create_project(parent.path(), "p", VERSION, NOW).unwrap_err()),
            "already-exists"
        );
    }

    #[test]
    fn create_surfaces_write_failures() {
        // `main.tex` already exists as a directory → the starter write fails.
        let parent = TempDir::new().unwrap();
        fs::create_dir_all(parent.path().join("p").join("main.tex")).unwrap();
        assert_eq!(
            tag(&create_project(parent.path(), "p", VERSION, NOW).unwrap_err()),
            "sandbox"
        );

        // `.galley` is a file → the manifest write fails (after main.tex succeeds).
        let parent2 = TempDir::new().unwrap();
        fs::create_dir_all(parent2.path().join("q")).unwrap();
        fs::write(parent2.path().join("q").join(".galley"), "x").unwrap();
        assert_eq!(
            tag(&create_project(parent2.path(), "q", VERSION, NOW).unwrap_err()),
            "sandbox"
        );
    }

    #[test]
    fn opens_a_folder_and_detects_the_root_and_files() {
        let dir = TempDir::new().unwrap();
        let store = SafeRoot::open(dir.path()).unwrap();
        store
            .write(
                "paper.tex",
                "\\documentclass{article}\\begin{document}x\\end{document}",
            )
            .unwrap();
        store.write("chapters/intro.tex", "intro text").unwrap();
        store.write("refs.bib", "@book{}").unwrap();
        store.write("logo.png", "PNG").unwrap();
        // An unreadable .tex is listed but skipped as a root candidate.
        store.write("locked.tex", "secret").unwrap();
        fs::set_permissions(
            dir.path().join("locked.tex"),
            fs::Permissions::from_mode(0o000),
        )
        .unwrap();

        let workspace = open_folder(dir.path(), VERSION, NOW).unwrap();
        assert_eq!(workspace.project.name, project_name_from_path(dir.path()));
        // `paper.tex` carries a real \documentclass, so it wins.
        assert_eq!(workspace.project.root_document, "paper.tex");
        let paths: Vec<&str> = workspace
            .project
            .documents
            .iter()
            .map(|d| d.path.as_str())
            .collect();
        assert!(paths.contains(&"refs.bib"));
        assert!(paths.contains(&"logo.png"));
        assert!(paths.contains(&"locked.tex"));

        // The manifest was created on open.
        assert!(SafeRoot::open(dir.path())
            .unwrap()
            .read(MANIFEST_PATH)
            .is_ok());
    }

    #[test]
    fn open_preserves_an_existing_manifest_name() {
        let dir = TempDir::new().unwrap();
        let store = SafeRoot::open(dir.path()).unwrap();
        store.write("main.tex", "hi").unwrap();
        let manifest = Manifest::new("Kept Name", "old", "0.0.1", "main.tex");
        store.write(MANIFEST_PATH, &manifest.render()).unwrap();

        let workspace = open_folder(dir.path(), VERSION, NOW).unwrap();
        assert_eq!(workspace.project.name, "Kept Name");
    }

    #[test]
    fn open_recreates_a_corrupt_or_deleted_manifest() {
        // Corrupt manifest → falls back to the folder name.
        let dir = TempDir::new().unwrap();
        let store = SafeRoot::open(dir.path()).unwrap();
        store.write("main.tex", "hi").unwrap();
        store
            .write(MANIFEST_PATH, "this is not a manifest")
            .unwrap();
        let workspace = open_folder(dir.path(), VERSION, NOW).unwrap();
        assert_eq!(workspace.project.name, project_name_from_path(dir.path()));

        // A folder with no `.galley/` at all (deletable without breaking it).
        let dir2 = TempDir::new().unwrap();
        SafeRoot::open(dir2.path())
            .unwrap()
            .write("notes.txt", "no tex here")
            .unwrap();
        let workspace2 = open_folder(dir2.path(), VERSION, NOW).unwrap();
        // No .tex → no root document.
        assert_eq!(workspace2.project.root_document, "");
    }

    #[test]
    fn open_reports_failures() {
        let dir = TempDir::new().unwrap();
        // Opening a path that does not exist.
        assert_eq!(
            tag(&open_folder(&dir.path().join("missing"), VERSION, NOW).unwrap_err()),
            "sandbox"
        );
        // Manifest write fails when `.galley` is a file.
        let dir2 = TempDir::new().unwrap();
        fs::write(dir2.path().join(".galley"), "x").unwrap();
        assert_eq!(
            tag(&open_folder(dir2.path(), VERSION, NOW).unwrap_err()),
            "sandbox"
        );
    }

    #[test]
    fn open_propagates_an_unreadable_subdirectory() {
        let dir = TempDir::new().unwrap();
        let locked = dir.path().join("locked");
        fs::create_dir(&locked).unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let result = open_folder(dir.path(), VERSION, NOW);
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(tag(&result.unwrap_err()), "sandbox");
    }

    #[test]
    fn errors_display_and_chain() {
        use std::error::Error;
        assert!(ImportError::InvalidName.to_string().contains("name"));
        assert!(ImportError::AlreadyExists.to_string().contains("already"));
        let sandbox = ImportError::Sandbox(SandboxError::Empty);
        assert!(sandbox.to_string().contains("project file error"));
        assert!(sandbox.source().is_some());
        let io = ImportError::Io(io::Error::other("boom"));
        assert!(io.to_string().contains("boom"));
        assert!(io.source().is_some());
        assert!(ImportError::InvalidName.source().is_none());
        assert!(format!("{:?}", ImportError::AlreadyExists).contains("AlreadyExists"));

        // Workspace derives.
        let workspace = Workspace {
            root: PathBuf::from("/tmp/p"),
            project: Project::new("p", "", vec![]),
        };
        assert_eq!(workspace.clone(), workspace);
        assert!(format!("{workspace:?}").contains("Workspace"));
    }
}
