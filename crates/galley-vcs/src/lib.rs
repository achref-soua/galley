//! Version-control adapter for Galley's git-backed history.
//!
//! This crate implements the `CheckpointHistory` port that auto-checkpoints
//! every save, stores named snapshots, lists the timeline, and restores any
//! prior version. The design mirrors `galley-compile`: a narrow trait seam
//! (`CheckpointHistory`) keeps the heavy git2/libgit2 call behind a feature
//! flag (`real-vcs`), so the orchestration layer is tested to 100% coverage
//! with an in-memory backend, and the real git backend is exercised by the
//! manual integration tests (`just vcs-itest`).
//!
//! Architecture: §7, v0.6.0. ADR-0023.

use galley_core::{snapshot_stats, SnapshotEntry};
use std::fmt;

// ── Error type ────────────────────────────────────────────────────────────────

/// Errors that can occur during checkpoint operations.
#[derive(Debug)]
pub struct HistoryError(String);

impl HistoryError {
    /// Build an error from any displayable message.
    #[must_use]
    pub fn new(msg: impl Into<String>) -> Self {
        Self(msg.into())
    }
}

impl fmt::Display for HistoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for HistoryError {}

// ── Port (trait) ──────────────────────────────────────────────────────────────

/// The port for the version-history feature.
///
/// Implementations must maintain a chain of commits on a hidden ref. Each
/// commit records the full content of the tracked file. Auto-saves use
/// `commit("auto")`, named snapshots use `commit(name)`.
pub trait CheckpointHistory {
    /// Record a new checkpoint with the given content and message.
    ///
    /// Returns an opaque identifier for the checkpoint (suitable for passing to
    /// [`Self::get_content`]).
    ///
    /// # Errors
    ///
    /// Returns [`HistoryError`] if the checkpoint cannot be persisted.
    fn commit(&mut self, content: &str, message: &str) -> Result<String, HistoryError>;

    /// Return all checkpoints, most-recent first, with change statistics.
    ///
    /// Returns an empty list rather than failing when no history exists yet.
    fn list(&self) -> Vec<SnapshotEntry>;

    /// Retrieve the document content stored at the given checkpoint.
    ///
    /// Returns `None` if the identifier is unknown or the content cannot be
    /// read.
    fn get_content(&self, checkpoint_id: &str) -> Option<String>;
}

// ── In-memory backend (always compiled; used by tests) ────────────────────────

/// A commit stored in the in-memory history backend.
struct MemCommit {
    id: String,
    message: String,
    date: String,
    content: String,
}

/// In-memory implementation of [`CheckpointHistory`], used for unit tests and
/// as the browser-side backend when no real git repo is available.
pub struct InMemoryHistory {
    commits: Vec<MemCommit>,
    next_id: u64,
}

impl InMemoryHistory {
    /// Create an empty history store.
    #[must_use]
    pub fn new() -> Self {
        Self {
            commits: Vec::new(),
            next_id: 1,
        }
    }
}

impl Default for InMemoryHistory {
    fn default() -> Self {
        Self::new()
    }
}

impl CheckpointHistory for InMemoryHistory {
    fn commit(&mut self, content: &str, message: &str) -> Result<String, HistoryError> {
        let id = format!("{:016x}", self.next_id);
        self.next_id += 1;
        self.commits.push(MemCommit {
            id: id.clone(),
            message: message.to_string(),
            date: "2026-01-01T00:00:00Z".to_string(),
            content: content.to_string(),
        });
        Ok(id)
    }

    fn list(&self) -> Vec<SnapshotEntry> {
        let n = self.commits.len();
        (0..n)
            .rev()
            .map(|i| {
                let c = &self.commits[i];
                let prev_content = if i > 0 {
                    self.commits[i - 1].content.as_str()
                } else {
                    ""
                };
                let (added, removed) = snapshot_stats(prev_content, &c.content);
                SnapshotEntry::new(
                    &c.id,
                    &c.message,
                    &c.date,
                    c.message != "auto",
                    added,
                    removed,
                )
            })
            .collect()
    }

    fn get_content(&self, checkpoint_id: &str) -> Option<String> {
        self.commits
            .iter()
            .find(|c| c.id == checkpoint_id)
            .map(|c| c.content.clone())
    }
}

// ── Real git2 backend (feature-gated) ────────────────────────────────────────

#[cfg(feature = "real-vcs")]
mod git2_history;
#[cfg(feature = "real-vcs")]
pub use git2_history::Git2History;

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn history() -> InMemoryHistory {
        InMemoryHistory::new()
    }

    // --- HistoryError ---

    #[test]
    fn history_error_display() {
        let e = HistoryError::new("something went wrong");
        assert_eq!(e.to_string(), "something went wrong");
        assert!(format!("{e:?}").contains("something went wrong"));
        let err: &dyn std::error::Error = &e;
        assert!(err.source().is_none());
    }

    // --- InMemoryHistory ---

    #[test]
    fn default_constructs_empty_history() {
        let h = InMemoryHistory::default();
        assert!(h.list().is_empty());
    }

    #[test]
    fn commit_returns_unique_ids() {
        let mut h = history();
        let id1 = h.commit("content one", "auto").unwrap();
        let id2 = h.commit("content two", "auto").unwrap();
        assert_ne!(id1, id2);
    }

    #[test]
    fn list_empty_when_no_commits() {
        let h = history();
        assert!(h.list().is_empty());
    }

    #[test]
    fn list_single_commit_has_correct_fields() {
        let mut h = history();
        let id = h.commit("hello world", "auto").unwrap();
        let entries = h.list();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, id);
        assert_eq!(entries[0].name, "auto");
        assert!(!entries[0].is_named);
        assert_eq!(entries[0].lines_added, 1);
        assert_eq!(entries[0].lines_removed, 0);
    }

    #[test]
    fn list_named_snapshot_has_is_named_true() {
        let mut h = history();
        h.commit("v1", "before refactor").unwrap();
        let entries = h.list();
        assert!(entries[0].is_named);
        assert_eq!(entries[0].name, "before refactor");
    }

    #[test]
    fn list_returns_most_recent_first() {
        let mut h = history();
        h.commit("first", "auto").unwrap();
        h.commit("second", "auto").unwrap();
        h.commit("third", "auto").unwrap();
        let entries = h.list();
        assert_eq!(entries.len(), 3);
        let first_id = &entries[0].id;
        assert_eq!(h.get_content(first_id).unwrap(), "third");
    }

    #[test]
    fn list_stats_track_incremental_changes() {
        let mut h = history();
        h.commit("a\nb\nc", "auto").unwrap();
        h.commit("a\nx\nc", "auto").unwrap();
        let entries = h.list();
        assert_eq!(entries[0].lines_added, 1);
        assert_eq!(entries[0].lines_removed, 1);
        assert_eq!(entries[1].lines_added, 3);
        assert_eq!(entries[1].lines_removed, 0);
    }

    #[test]
    fn get_content_known_id_returns_content() {
        let mut h = history();
        let id = h.commit("the content", "auto").unwrap();
        assert_eq!(h.get_content(&id), Some("the content".to_string()));
    }

    #[test]
    fn get_content_unknown_id_returns_none() {
        let h = history();
        assert_eq!(h.get_content("does-not-exist"), None);
    }

    #[test]
    fn get_content_after_multiple_commits() {
        let mut h = history();
        let id1 = h.commit("v1", "auto").unwrap();
        let id2 = h.commit("v2", "auto").unwrap();
        assert_eq!(h.get_content(&id1), Some("v1".to_string()));
        assert_eq!(h.get_content(&id2), Some("v2".to_string()));
    }

    #[test]
    fn in_memory_history_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<InMemoryHistory>();
    }
}
