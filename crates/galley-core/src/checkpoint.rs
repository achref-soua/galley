//! In-memory checkpoint store for autonomous-agent sessions.
//!
//! A checkpoint captures a named snapshot of document content at a point
//! during an autonomous run.  The store is append-only during the run;
//! [`CheckpointStore::revert_to`] returns the stored content without mutating
//! the history — the caller decides whether to record a new checkpoint after
//! applying the revert.

/// A named snapshot of document content taken at an autonomous-agent checkpoint.
#[derive(Debug, Clone, PartialEq)]
pub struct Checkpoint {
    /// Human-readable label chosen by the session that created the checkpoint.
    pub name: String,
    /// Document content as it existed when the checkpoint was saved.
    pub content: String,
}

impl Checkpoint {
    /// Construct a checkpoint from a label and document content.
    pub fn new(name: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            content: content.into(),
        }
    }
}

/// Ordered, in-memory history of checkpoints for one autonomous agent run.
///
/// Checkpoints are appended with [`push`](CheckpointStore::push).
/// [`revert_to`](CheckpointStore::revert_to) performs a reverse-linear scan
/// and returns the content of the most-recent checkpoint with the given name,
/// without removing anything from the history.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct CheckpointStore {
    checkpoints: Vec<Checkpoint>,
}

impl CheckpointStore {
    /// Create an empty checkpoint store.
    pub fn new() -> Self {
        Self::default()
    }

    /// Append a new checkpoint with the given label and document content.
    pub fn push(&mut self, name: impl Into<String>, content: impl Into<String>) {
        self.checkpoints.push(Checkpoint::new(name, content));
    }

    /// Return the content of the most-recently-saved checkpoint whose label
    /// equals `name`, or `None` if no matching checkpoint exists.
    pub fn revert_to(&self, name: &str) -> Option<&str> {
        self.checkpoints
            .iter()
            .rev()
            .find(|c| c.name == name)
            .map(|c| c.content.as_str())
    }

    /// Iterator over checkpoint labels in insertion order.
    pub fn names(&self) -> impl Iterator<Item = &str> {
        self.checkpoints.iter().map(|c| c.name.as_str())
    }

    /// Total number of checkpoints saved so far.
    pub fn len(&self) -> usize {
        self.checkpoints.len()
    }

    /// Whether the store contains no checkpoints.
    pub fn is_empty(&self) -> bool {
        self.checkpoints.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Checkpoint ────────────────────────────────────────────────────────────

    #[test]
    fn checkpoint_new_stores_name_and_content() {
        let cp = Checkpoint::new("step-1", "\\section{Intro}");
        assert_eq!(cp.name, "step-1");
        assert_eq!(cp.content, "\\section{Intro}");
    }

    #[test]
    fn checkpoint_clone_eq_debug() {
        let a = Checkpoint::new("x", "y");
        let b = a.clone();
        assert_eq!(a, b);
        assert!(format!("{a:?}").contains("Checkpoint"));
    }

    // ── CheckpointStore — empty ───────────────────────────────────────────────

    #[test]
    fn store_new_is_empty() {
        let s = CheckpointStore::new();
        assert!(s.is_empty());
        assert_eq!(s.len(), 0);
    }

    #[test]
    fn store_default_is_empty() {
        let s = CheckpointStore::default();
        assert!(s.is_empty());
    }

    #[test]
    fn store_revert_to_returns_none_when_empty() {
        let s = CheckpointStore::new();
        assert!(s.revert_to("anything").is_none());
    }

    #[test]
    fn store_names_yields_nothing_when_empty() {
        let s = CheckpointStore::new();
        assert_eq!(s.names().count(), 0);
    }

    // ── CheckpointStore — push ────────────────────────────────────────────────

    #[test]
    fn push_increments_len_and_clears_empty() {
        let mut s = CheckpointStore::new();
        s.push("cp-1", "content a");
        assert!(!s.is_empty());
        assert_eq!(s.len(), 1);
        s.push("cp-2", "content b");
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn names_preserves_insertion_order() {
        let mut s = CheckpointStore::new();
        s.push("first", "a");
        s.push("second", "b");
        s.push("third", "c");
        let names: Vec<&str> = s.names().collect();
        assert_eq!(names, vec!["first", "second", "third"]);
    }

    // ── CheckpointStore — revert_to ───────────────────────────────────────────

    #[test]
    fn revert_to_returns_content_for_known_name() {
        let mut s = CheckpointStore::new();
        s.push("cp-1", "draft one");
        assert_eq!(s.revert_to("cp-1"), Some("draft one"));
    }

    #[test]
    fn revert_to_returns_none_for_unknown_name() {
        let mut s = CheckpointStore::new();
        s.push("cp-1", "draft one");
        assert!(s.revert_to("cp-99").is_none());
    }

    #[test]
    fn revert_to_returns_most_recent_when_name_duplicated() {
        let mut s = CheckpointStore::new();
        s.push("step", "first version");
        s.push("step", "second version");
        // rev() scan returns the later entry first.
        assert_eq!(s.revert_to("step"), Some("second version"));
    }

    #[test]
    fn revert_to_does_not_mutate_the_store() {
        let mut s = CheckpointStore::new();
        s.push("cp", "text");
        let _ = s.revert_to("cp");
        assert_eq!(s.len(), 1);
    }

    // ── CheckpointStore — clone/eq/debug ─────────────────────────────────────

    #[test]
    fn store_clone_eq_debug() {
        let mut s = CheckpointStore::new();
        s.push("a", "b");
        let t = s.clone();
        assert_eq!(s, t);
        assert!(format!("{s:?}").contains("CheckpointStore"));
    }
}
