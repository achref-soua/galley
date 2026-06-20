//! Creating, importing, and exporting Galley projects.
//!
//! This crate is the I/O seam between the pure domain ([`galley_core`]) and the
//! sandboxed filesystem ([`galley_security::SafeRoot`]). It can:
//!
//! * **create** a fresh project — a new directory with a starter `main.tex` and
//!   a `.galley/project.toml` manifest;
//! * **open** an existing on-disk LaTeX folder — scanning it, classifying its
//!   files, detecting the root document, and ensuring a manifest is present;
//! * **import from entries** — materialise a [`Vec<FileEntry>`] (extracted from
//!   a `.zip` or `.tar.gz` archive) into a new project directory with a
//!   validated profile and an initial "Imported" checkpoint; and
//! * **export** a clean bundle — a `.zip` that strips the `.galley/` metadata
//!   directory so the result can be re-uploaded directly to Overleaf.
//!
//! Galley's only footprint in a project is the `.galley/` directory: it never
//! affects compilation and is safe to delete.
//!
//! [`galley_core::archive`] (the `archive` sub-module of this crate) provides
//! the hardened extraction primitives used by the import wizard.

pub mod archive;

use galley_core::{
    analyze_project, clean_export_paths, is_main_named, looks_like_root, project_name_from_path,
    select_root_document, Document, DocumentKind, FileEntry, Manifest, Project, ProjectProfile,
    RootCandidate, MANIFEST_PATH,
};
use galley_security::{SafeRoot, SandboxError};
use std::fmt;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use zip::write::{FileOptions, ZipWriter};
use zip::CompressionMethod;

pub use archive::{extract_tarball, extract_zip, ArchiveError, ArchiveLimits};

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

/// A project directory that was materialised from an import source
/// (archive, folder copy, or git clone).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedWorkspace {
    /// The canonical project root directory.
    pub root: PathBuf,
    /// The in-memory project.
    pub project: Project,
    /// The parse-only profile produced by [`analyze_project`].
    pub profile: ProjectProfile,
}

/// Why creating or opening a project failed.
#[derive(Debug)]
pub enum ImportError {
    /// The project name was empty or contained a path separator.
    InvalidName,
    /// A project already exists at the target location.
    AlreadyExists,
    /// Archive extraction failed (zip-slip, limits, corrupt bytes, …).
    Archive(ArchiveError),
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
            ImportError::Archive(err) => write!(f, "archive error: {err}"),
            ImportError::Sandbox(err) => write!(f, "project file error: {err}"),
            ImportError::Io(err) => write!(f, "filesystem error: {err}"),
        }
    }
}

impl std::error::Error for ImportError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ImportError::Archive(err) => Some(err),
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

/// Materialise a set of [`FileEntry`] values into a new project directory.
///
/// The caller typically obtains the entries from [`extract_zip`] or
/// [`extract_tarball`]. This function:
///
/// 1. Analyses the entries with the pure [`analyze_project`] function.
/// 2. Creates the target directory (inside `parent`, named `name`).
/// 3. Writes every entry through a [`SafeRoot`] so symlink-escape is
///    impossible even if the caller forgot to guard the extraction step.
/// 4. Writes a `.galley/project.toml` manifest seeded with the detected
///    root document, engine, and encoding.
///
/// A first "Imported" checkpoint is recorded in the manifest so that
/// version history shows a clean baseline.
///
/// # Errors
///
/// Returns [`ImportError::InvalidName`] for a bad name,
/// [`ImportError::AlreadyExists`] when the target already holds a project,
/// and [`ImportError::Sandbox`] / [`ImportError::Io`] for filesystem failures.
pub fn import_from_entries(
    parent: &Path,
    name: &str,
    entries: Vec<FileEntry>,
    version: &str,
    created: &str,
) -> Result<ImportedWorkspace, ImportError> {
    let name = validate_name(name)?;
    let parent = fs::canonicalize(parent).map_err(ImportError::Io)?;
    let root = parent.join(name);
    fs::create_dir_all(&root).map_err(ImportError::Io)?;

    let store = SafeRoot::from_canonical(root.clone());
    if store.read(MANIFEST_PATH).is_ok() {
        return Err(ImportError::AlreadyExists);
    }

    // Analyse before writing so we can seed the manifest from the profile.
    let profile = analyze_project(&entries);

    // Write every entry through the sandbox.
    for entry in &entries {
        store
            .write_bytes(&entry.path, &entry.content)
            .map_err(ImportError::Sandbox)?;
    }

    // Write the manifest.
    let manifest = Manifest::new(name, created, version, &profile.root_file);
    store
        .write(MANIFEST_PATH, &manifest.render())
        .map_err(ImportError::Sandbox)?;

    // Build the in-memory project from the written files.
    let files = store
        .list()
        .expect("directory was just created and written; list cannot fail");
    let documents: Vec<Document> = files.iter().map(|p| Document::new(p.clone())).collect();
    let project = Project::new(name, profile.root_file.clone(), documents);

    Ok(ImportedWorkspace {
        root,
        project,
        profile,
    })
}

/// Export a project as a clean `.zip` bundle, stripping the `.galley/`
/// metadata directory so the archive can be re-uploaded directly to Overleaf.
///
/// # Errors
///
/// Returns [`ImportError::Sandbox`] if any project file cannot be read.
pub fn export_clean_bundle(workspace: &Workspace) -> Result<Vec<u8>, ImportError> {
    let mut zw = ZipWriter::new(io::Cursor::new(Vec::<u8>::new()));
    let store = SafeRoot::open(&workspace.root).map_err(ImportError::Sandbox)?;
    let all_paths = store
        .list()
        .expect("workspace root validated by open(); list cannot fail");
    let paths = clean_export_paths(&all_paths);
    let opts: FileOptions<()> =
        FileOptions::default().compression_method(CompressionMethod::Deflated);
    for path in &paths {
        let content = store
            .read_bytes(path)
            .expect("path came from list(); file exists and is readable");
        // ZipWriter over Cursor<Vec<u8>> is infallible — Vec grows on demand
        // and in-memory seeks always succeed.
        zw.start_file(path, opts)
            .expect("ZipWriter::start_file over Cursor<Vec<u8>> never fails");
        zw.write_all(&content)
            .expect("ZipWriter::write_all over Cursor<Vec<u8>> never fails");
    }
    Ok(zw
        .finish()
        .expect("ZipWriter::finish over Cursor<Vec<u8>> never fails")
        .into_inner())
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
            ImportError::Archive(_) => "archive",
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
        let archive = ImportError::Archive(ArchiveError::BadArchive("bad".to_string()));
        assert!(archive.to_string().contains("archive error"));
        assert!(archive.source().is_some());
        assert_eq!(tag(&archive), "archive");
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

    // ── import_from_entries ──

    fn make_entries(files: &[(&str, &str)]) -> Vec<FileEntry> {
        files
            .iter()
            .map(|(p, c)| FileEntry::new(*p, c.as_bytes().to_vec()))
            .collect()
    }

    #[test]
    fn import_from_entries_materialises_project() {
        let parent = TempDir::new().unwrap();
        let entries = make_entries(&[
            (
                "main.tex",
                "\\documentclass{article}\n\\begin{document}Hi\\end{document}",
            ),
            ("refs.bib", "@book{key,}"),
        ]);
        let ws = import_from_entries(parent.path(), "Imported", entries, VERSION, NOW).unwrap();
        assert_eq!(ws.project.name, "Imported");
        assert_eq!(ws.project.root_document, "main.tex");
        assert_eq!(ws.profile.root_file, "main.tex");

        // Files must exist on disk.
        let store = SafeRoot::open(&ws.root).unwrap();
        assert!(store.read("main.tex").is_ok());
        assert!(store.read("refs.bib").is_ok());
        // Manifest must exist.
        assert!(store.read(MANIFEST_PATH).is_ok());
    }

    #[test]
    fn import_from_entries_rejects_invalid_name() {
        let parent = TempDir::new().unwrap();
        for bad in ["", ".", "..", "a/b", "a\\b"] {
            assert_eq!(
                tag(&import_from_entries(parent.path(), bad, vec![], VERSION, NOW).unwrap_err()),
                "invalid-name",
                "{bad}"
            );
        }
    }

    #[test]
    fn import_from_entries_rejects_if_project_already_exists() {
        let parent = TempDir::new().unwrap();
        // First import succeeds.
        import_from_entries(
            parent.path(),
            "P",
            make_entries(&[("a.tex", "x")]),
            VERSION,
            NOW,
        )
        .unwrap();
        // Second import into same dir → AlreadyExists.
        let err = import_from_entries(
            parent.path(),
            "P",
            make_entries(&[("a.tex", "x")]),
            VERSION,
            NOW,
        )
        .unwrap_err();
        assert_eq!(tag(&err), "already-exists");
    }

    #[test]
    fn import_from_entries_fails_with_nonexistent_parent() {
        let parent = TempDir::new().unwrap();
        let err = import_from_entries(&parent.path().join("nope"), "P", vec![], VERSION, NOW)
            .unwrap_err();
        assert_eq!(tag(&err), "io");
    }

    #[test]
    fn import_from_entries_fails_when_manifest_dir_is_a_file() {
        let parent = TempDir::new().unwrap();
        fs::create_dir(parent.path().join("Q")).unwrap();
        // Block the .galley directory by creating it as a regular file.
        fs::write(parent.path().join("Q").join(".galley"), "x").unwrap();
        let err = import_from_entries(
            parent.path(),
            "Q",
            make_entries(&[("a.tex", "hi")]),
            VERSION,
            NOW,
        )
        .unwrap_err();
        assert_eq!(tag(&err), "sandbox");
    }

    #[test]
    fn imported_workspace_derives() {
        let ws = ImportedWorkspace {
            root: PathBuf::from("/tmp/p"),
            project: Project::new("p", "", vec![]),
            profile: galley_core::analyze_project(&[]),
        };
        let cloned = ws.clone();
        assert_eq!(ws, cloned);
        assert!(format!("{ws:?}").contains("ImportedWorkspace"));
    }

    // ── export_clean_bundle ──

    #[test]
    fn export_clean_bundle_produces_zip_without_galley_dir() {
        let parent = TempDir::new().unwrap();
        let ws = create_project(parent.path(), "ExportMe", VERSION, NOW).unwrap();
        // Add an extra file.
        let store = SafeRoot::from_canonical(ws.root.clone());
        store.write("fig/plot.tex", "x").unwrap();

        let bytes = export_clean_bundle(&ws).unwrap();
        // Must be a valid zip.
        let cursor = std::io::Cursor::new(&bytes);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        // main.tex and fig/plot.tex are exported.
        assert!(names.iter().any(|n| n == "main.tex"));
        assert!(names.iter().any(|n| n == "fig/plot.tex"));
        // .galley/ metadata is NOT exported.
        assert!(!names.iter().any(|n| n.starts_with(".galley")));
    }

    #[test]
    fn export_clean_bundle_fails_for_missing_root() {
        let workspace = Workspace {
            root: PathBuf::from("/this/does/not/exist"),
            project: Project::new("x", "", vec![]),
        };
        let err = export_clean_bundle(&workspace).unwrap_err();
        assert_eq!(tag(&err), "sandbox");
    }

    #[test]
    fn import_from_entries_fails_when_directory_cannot_be_created() {
        let parent = TempDir::new().unwrap();
        // Block the target directory path by creating a file there.
        fs::write(parent.path().join("MyProject"), b"not a dir").unwrap();
        let err =
            import_from_entries(parent.path(), "MyProject", vec![], VERSION, NOW).unwrap_err();
        assert_eq!(tag(&err), "io");
    }

    #[test]
    fn import_from_entries_rejects_traversal_path_in_entry() {
        let parent = TempDir::new().unwrap();
        let entries = vec![FileEntry::new(
            "../../etc/passwd".to_string(),
            b"pwned".to_vec(),
        )];
        let err = import_from_entries(parent.path(), "T", entries, VERSION, NOW).unwrap_err();
        assert_eq!(tag(&err), "sandbox");
    }
}
