//! The in-memory project aggregate.
//!
//! A [`Project`] is the pure value the rest of Galley works with once a folder
//! has been opened or created: its name, the detected root document, and the
//! list of files it contains. Building one from disk lives in the I/O crates;
//! this module stays free of the filesystem so it is trivially testable.

use crate::document::Document;
use std::path::Path;

/// A project as Galley holds it in memory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    /// Human-facing project name.
    pub name: String,
    /// Project-relative path of the root document, or empty when none was found.
    pub root_document: String,
    /// Every file in the project (excluding Galley's own `.galley/` metadata).
    pub documents: Vec<Document>,
}

impl Project {
    /// Assemble a project from its parts.
    #[must_use]
    pub fn new(
        name: impl Into<String>,
        root_document: impl Into<String>,
        documents: Vec<Document>,
    ) -> Self {
        Self {
            name: name.into(),
            root_document: root_document.into(),
            documents,
        }
    }
}

/// Derive a default project name from a directory path: its final component,
/// falling back to `"project"` when the path has no name (e.g. the filesystem
/// root).
#[must_use]
pub fn project_name_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| "project".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::DocumentKind;

    #[test]
    fn builds_a_project() {
        let project = Project::new(
            "Paper",
            "main.tex",
            vec![Document::new("main.tex"), Document::new("refs.bib")],
        );
        assert_eq!(project.name, "Paper");
        assert_eq!(project.root_document, "main.tex");
        assert_eq!(project.documents.len(), 2);
        assert_eq!(project.documents[1].kind, DocumentKind::Bib);
    }

    #[test]
    fn names_from_a_normal_path() {
        assert_eq!(
            project_name_from_path(Path::new("/home/ada/thesis")),
            "thesis"
        );
    }

    #[test]
    fn names_fall_back_at_the_filesystem_root() {
        assert_eq!(project_name_from_path(Path::new("/")), "project");
    }

    #[test]
    fn project_derives_are_usable() {
        let project = Project::new("n", "", vec![]);
        let cloned = project.clone();
        assert_eq!(project, cloned);
        assert_ne!(project, Project::new("other", "", vec![]));
        assert!(format!("{project:?}").contains("Project"));
    }
}
