//! Real git2 backend for [`CheckpointHistory`](super::CheckpointHistory).
//!
//! Only compiled when the `real-vcs` feature is enabled (the Tauri shell).
//! Integration tests live in `tests/real_vcs.rs` and are `#[ignore]`d from the
//! standard gate — run them with `just vcs-itest`.

use super::{CheckpointHistory, HistoryError};
use galley_core::{snapshot_stats, SnapshotEntry};
use git2::{FileMode, Repository, Signature};
use std::path::Path;

/// The hidden ref that stores all checkpoint commits for the project.
const HISTORY_REF: &str = "refs/galley/checkpoints";

/// The in-tree path used to store the document blob in each commit.
const BLOB_PATH: &str = "document";

/// Git-backed implementation of [`CheckpointHistory`].
///
/// Opens or initialises a git repository at the project root and stores each
/// checkpoint as a commit on [`HISTORY_REF`]. The ref is hidden from normal
/// `git log` output (it is not under `refs/heads/`).
pub struct Git2History {
    repo: Repository,
}

impl Git2History {
    /// Open an existing git repository at `path`, or initialise a new one.
    ///
    /// # Errors
    ///
    /// Returns [`HistoryError`] if neither opening nor initialising succeeds
    /// (e.g., the path's parent directory does not exist).
    pub fn init_or_open(path: &Path) -> Result<Self, HistoryError> {
        let repo = Repository::open(path)
            .or_else(|_| Repository::init(path))
            .map_err(|e| HistoryError::new(e.to_string()))?;
        Ok(Self { repo })
    }
}

impl CheckpointHistory for Git2History {
    fn commit(&mut self, content: &str, message: &str) -> Result<String, HistoryError> {
        let blob = self
            .repo
            .blob(content.as_bytes())
            .map_err(|e| HistoryError::new(e.to_string()))?;

        let mut tb = self
            .repo
            .treebuilder(None)
            .map_err(|e| HistoryError::new(e.to_string()))?;

        tb.insert(BLOB_PATH, blob, FileMode::Blob.into())
            .map_err(|e| HistoryError::new(e.to_string()))?;

        let tree_oid = tb.write().map_err(|e| HistoryError::new(e.to_string()))?;
        let tree = self
            .repo
            .find_tree(tree_oid)
            .map_err(|e| HistoryError::new(e.to_string()))?;

        let sig = Signature::now("Galley", "galley@local")
            .map_err(|e| HistoryError::new(e.to_string()))?;

        let tip = self.repo.find_reference(HISTORY_REF).ok();
        let parent_commit = tip.as_ref().and_then(|r| r.peel_to_commit().ok());
        let parents: Vec<&git2::Commit<'_>> = parent_commit.iter().collect();

        let oid = self
            .repo
            .commit(Some(HISTORY_REF), &sig, &sig, message, &tree, &parents)
            .map_err(|e| HistoryError::new(e.to_string()))?;

        Ok(oid.to_string())
    }

    fn list(&self) -> Vec<SnapshotEntry> {
        let tip = match self.repo.find_reference(HISTORY_REF) {
            Ok(r) => r,
            Err(_) => return Vec::new(),
        };
        let head_commit = match tip.peel_to_commit() {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };

        let mut walk = match self.repo.revwalk() {
            Ok(w) => w,
            Err(_) => return Vec::new(),
        };
        if walk.push(head_commit.id()).is_err() {
            return Vec::new();
        }

        let oids: Vec<git2::Oid> = walk.filter_map(|r| r.ok()).collect();

        oids.iter()
            .filter_map(|oid| {
                let commit = self.repo.find_commit(*oid).ok()?;
                let content = blob_content(&self.repo, &commit)?;
                let parent_content = commit
                    .parent(0)
                    .ok()
                    .and_then(|p| blob_content(&self.repo, &p))
                    .unwrap_or_default();
                let message = commit.message().unwrap_or("auto").to_string();
                let (added, removed) = snapshot_stats(&parent_content, &content);
                let timestamp = commit.time().seconds();
                let date = format_timestamp(timestamp);
                Some(SnapshotEntry::new(
                    oid.to_string(),
                    &message,
                    date,
                    message != "auto",
                    added,
                    removed,
                ))
            })
            .collect()
    }

    fn get_content(&self, checkpoint_id: &str) -> Option<String> {
        let oid = git2::Oid::from_str(checkpoint_id).ok()?;
        let commit = self.repo.find_commit(oid).ok()?;
        blob_content(&self.repo, &commit)
    }
}

fn blob_content(repo: &Repository, commit: &git2::Commit<'_>) -> Option<String> {
    let tree = commit.tree().ok()?;
    let entry = tree.get_name(BLOB_PATH)?;
    let obj = entry.to_object(repo).ok()?;
    let blob = obj.as_blob()?;
    std::str::from_utf8(blob.content()).ok().map(String::from)
}

fn format_timestamp(unix_secs: i64) -> String {
    // Minimal ISO-8601 UTC formatter without external deps.
    let secs_per_min = 60i64;
    let secs_per_hour = 3600i64;
    let secs_per_day = 86400i64;

    let s = unix_secs.max(0) as u64;
    let mut days = s / secs_per_day as u64;
    let rem = s % secs_per_day as u64;
    let hh = rem / secs_per_hour as u64;
    let mm = (rem % secs_per_hour as u64) / secs_per_min as u64;
    let ss = rem % secs_per_min as u64;

    // Civil date from day count (algorithm from Howard Hinnant).
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!("{year:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires libgit2; run with `just vcs-itest`"]
    fn real_init_or_open_creates_new_repo() {
        let dir = tempfile::tempdir().unwrap();
        let h = Git2History::init_or_open(dir.path()).unwrap();
        assert!(h.repo.is_empty().unwrap());
    }

    #[test]
    #[ignore = "requires libgit2; run with `just vcs-itest`"]
    fn real_init_or_open_opens_existing_repo() {
        let dir = tempfile::tempdir().unwrap();
        git2::Repository::init(dir.path()).unwrap();
        Git2History::init_or_open(dir.path()).unwrap();
    }

    #[test]
    #[ignore = "requires libgit2; run with `just vcs-itest`"]
    fn real_commit_and_list_and_restore() {
        let dir = tempfile::tempdir().unwrap();
        let mut h = Git2History::init_or_open(dir.path()).unwrap();
        let id = h.commit("initial content", "auto").unwrap();
        let entries = h.list();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, id);
        assert_eq!(h.get_content(&id).unwrap(), "initial content");
    }

    #[test]
    #[ignore = "requires libgit2; run with `just vcs-itest`"]
    fn real_init_or_open_fails_on_non_existent_parent() {
        let result = Git2History::init_or_open(Path::new("/nonexistent/parent/path"));
        assert!(result.is_err());
    }

    #[test]
    fn format_timestamp_epoch() {
        assert_eq!(format_timestamp(0), "1970-01-01T00:00:00Z");
    }

    #[test]
    fn format_timestamp_known_date() {
        // 2026-06-20T12:34:56Z = 1781959696 seconds since Unix epoch.
        // (= 1750423696 + 365*86400; 2025 is not a leap year.)
        let ts = 1_781_959_696i64;
        let s = format_timestamp(ts);
        assert!(s.starts_with("2026-06-20T"), "got {s}");
    }

    #[test]
    fn format_timestamp_negative_clamped_to_epoch() {
        assert_eq!(format_timestamp(-1), "1970-01-01T00:00:00Z");
    }
}
