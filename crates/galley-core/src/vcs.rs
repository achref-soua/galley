//! Pure domain types for the git-backed version history feature.
//!
//! This module holds the data structures shared between the Tauri commands and
//! the frontend, plus a pure line-diff algorithm that produces human-readable
//! diffs without any I/O. All git operations live in `galley-vcs`.

/// A single entry in the version history timeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotEntry {
    /// Opaque identifier for this checkpoint (git commit OID as hex).
    pub id: String,
    /// Human-readable label: `"auto"` for auto-saves, or the user's chosen name.
    pub name: String,
    /// ISO-8601 UTC timestamp of this checkpoint.
    pub date: String,
    /// True when the user gave this checkpoint an explicit name.
    pub is_named: bool,
    /// Lines added relative to the previous checkpoint.
    pub lines_added: usize,
    /// Lines removed relative to the previous checkpoint.
    pub lines_removed: usize,
}

impl SnapshotEntry {
    /// Construct a new entry.
    #[must_use]
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        date: impl Into<String>,
        is_named: bool,
        lines_added: usize,
        lines_removed: usize,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            date: date.into(),
            is_named,
            lines_added,
            lines_removed,
        }
    }
}

/// How a line in a [`DiffLine`] relates to the two versions being compared.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffKind {
    /// Line present only in the new version.
    Added,
    /// Line present only in the old version.
    Removed,
    /// Line unchanged between both versions.
    Context,
}

/// A single line of a unified diff.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffLine {
    /// Whether this line was added, removed, or unchanged.
    pub kind: DiffKind,
    /// The line content (without a trailing newline).
    pub text: String,
}

impl DiffLine {
    /// Construct a new diff line.
    #[must_use]
    pub fn new(kind: DiffKind, text: impl Into<String>) -> Self {
        Self {
            kind,
            text: text.into(),
        }
    }
}

/// Compute how many lines were added and removed going from `old` to `new`.
#[must_use]
pub fn snapshot_stats(old: &str, new_content: &str) -> (usize, usize) {
    let diff = compute_diff(old, new_content);
    let added = diff.iter().filter(|d| d.kind == DiffKind::Added).count();
    let removed = diff.iter().filter(|d| d.kind == DiffKind::Removed).count();
    (added, removed)
}

/// Produce a line-level diff between `old` and `new_content`.
///
/// Returns every line tagged as [`DiffKind::Added`], [`DiffKind::Removed`], or
/// [`DiffKind::Context`]. The algorithm uses a simple longest-common-subsequence
/// (LCS) approach that is fast enough for typical LaTeX documents.
#[must_use]
pub fn compute_diff(old: &str, new_content: &str) -> Vec<DiffLine> {
    let a: Vec<&str> = old.lines().collect();
    let b: Vec<&str> = new_content.lines().collect();

    if a.is_empty() && b.is_empty() {
        return Vec::new();
    }

    let lcs = lcs_table(&a, &b);
    let mut result = Vec::new();
    emit_diff(&a, &b, a.len(), b.len(), &lcs, &mut result);
    result
}

// Build the LCS length table using dynamic programming.
fn lcs_table<'a>(a: &[&'a str], b: &[&'a str]) -> Vec<Vec<usize>> {
    let m = a.len();
    let n = b.len();
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in 1..=m {
        for j in 1..=n {
            if a[i - 1] == b[j - 1] {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else if dp[i - 1][j] >= dp[i][j - 1] {
                dp[i][j] = dp[i - 1][j];
            } else {
                dp[i][j] = dp[i][j - 1];
            }
        }
    }
    dp
}

// Recursive LCS back-tracking to emit diff lines.
fn emit_diff(
    a: &[&str],
    b: &[&str],
    i: usize,
    j: usize,
    dp: &Vec<Vec<usize>>,
    out: &mut Vec<DiffLine>,
) {
    if i == 0 && j == 0 {
        return;
    }
    if i == 0 {
        emit_diff(a, b, 0, j - 1, dp, out);
        out.push(DiffLine::new(DiffKind::Added, b[j - 1]));
    } else if j == 0 {
        emit_diff(a, b, i - 1, 0, dp, out);
        out.push(DiffLine::new(DiffKind::Removed, a[i - 1]));
    } else if a[i - 1] == b[j - 1] {
        emit_diff(a, b, i - 1, j - 1, dp, out);
        out.push(DiffLine::new(DiffKind::Context, a[i - 1]));
    } else if dp[i - 1][j] >= dp[i][j - 1] {
        emit_diff(a, b, i - 1, j, dp, out);
        out.push(DiffLine::new(DiffKind::Removed, a[i - 1]));
    } else {
        emit_diff(a, b, i, j - 1, dp, out);
        out.push(DiffLine::new(DiffKind::Added, b[j - 1]));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- SnapshotEntry ---

    #[test]
    fn snapshot_entry_constructor_and_fields() {
        let e = SnapshotEntry::new("abc123", "my save", "2026-06-20T10:00:00Z", true, 3, 1);
        assert_eq!(e.id, "abc123");
        assert_eq!(e.name, "my save");
        assert_eq!(e.date, "2026-06-20T10:00:00Z");
        assert!(e.is_named);
        assert_eq!(e.lines_added, 3);
        assert_eq!(e.lines_removed, 1);
    }

    #[test]
    fn snapshot_entry_auto_not_named() {
        let e = SnapshotEntry::new("x", "auto", "2026-01-01T00:00:00Z", false, 0, 0);
        assert!(!e.is_named);
        assert_eq!(e.name, "auto");
    }

    #[test]
    fn snapshot_entry_clone_eq() {
        let a = SnapshotEntry::new("a", "auto", "2026-01-01", false, 1, 2);
        let b = a.clone();
        assert_eq!(a, b);
        // Exercise Debug
        assert!(format!("{a:?}").contains("auto"));
    }

    // --- DiffLine / DiffKind ---

    #[test]
    fn diff_line_construction() {
        let added = DiffLine::new(DiffKind::Added, "new line");
        let removed = DiffLine::new(DiffKind::Removed, "old line");
        let ctx = DiffLine::new(DiffKind::Context, "same");
        assert_eq!(added.kind, DiffKind::Added);
        assert_eq!(removed.kind, DiffKind::Removed);
        assert_eq!(ctx.kind, DiffKind::Context);
    }

    #[test]
    fn diff_kind_copy_and_debug() {
        let k = DiffKind::Added;
        let k2 = k; // Copy
        assert_eq!(k, k2);
        assert_eq!(format!("{k:?}"), "Added");
        assert_eq!(format!("{:?}", DiffKind::Removed), "Removed");
        assert_eq!(format!("{:?}", DiffKind::Context), "Context");
    }

    #[test]
    fn diff_line_clone_and_eq() {
        let a = DiffLine::new(DiffKind::Added, "x");
        let b = a.clone();
        assert_eq!(a, b);
        assert!(format!("{a:?}").contains("Added"));
    }

    // --- compute_diff ---

    #[test]
    fn diff_both_empty() {
        assert!(compute_diff("", "").is_empty());
    }

    #[test]
    fn diff_old_empty_adds_all() {
        let result = compute_diff("", "line1\nline2");
        assert_eq!(result.len(), 2);
        assert!(result.iter().all(|d| d.kind == DiffKind::Added));
        assert_eq!(result[0].text, "line1");
        assert_eq!(result[1].text, "line2");
    }

    #[test]
    fn diff_new_empty_removes_all() {
        let result = compute_diff("line1\nline2", "");
        assert_eq!(result.len(), 2);
        assert!(result.iter().all(|d| d.kind == DiffKind::Removed));
    }

    #[test]
    fn diff_identical_content_all_context() {
        let s = "alpha\nbeta\ngamma";
        let result = compute_diff(s, s);
        assert!(result.iter().all(|d| d.kind == DiffKind::Context));
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn diff_single_line_addition() {
        let result = compute_diff("a\nc", "a\nb\nc");
        let added: Vec<_> = result
            .iter()
            .filter(|d| d.kind == DiffKind::Added)
            .collect();
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].text, "b");
    }

    #[test]
    fn diff_single_line_removal() {
        let result = compute_diff("a\nb\nc", "a\nc");
        let removed: Vec<_> = result
            .iter()
            .filter(|d| d.kind == DiffKind::Removed)
            .collect();
        assert_eq!(removed.len(), 1);
        assert_eq!(removed[0].text, "b");
    }

    #[test]
    fn diff_replacement() {
        let result = compute_diff("hello", "world");
        assert_eq!(result.len(), 2);
        let has_removed = result
            .iter()
            .any(|d| d.kind == DiffKind::Removed && d.text == "hello");
        let has_added = result
            .iter()
            .any(|d| d.kind == DiffKind::Added && d.text == "world");
        assert!(has_removed);
        assert!(has_added);
    }

    #[test]
    fn diff_interleaved_changes() {
        let old = "a\nb\nc\nd";
        let new = "a\nx\nc\ny";
        let result = compute_diff(old, new);
        let added: Vec<_> = result
            .iter()
            .filter(|d| d.kind == DiffKind::Added)
            .collect();
        let removed: Vec<_> = result
            .iter()
            .filter(|d| d.kind == DiffKind::Removed)
            .collect();
        let context: Vec<_> = result
            .iter()
            .filter(|d| d.kind == DiffKind::Context)
            .collect();
        assert_eq!(added.len(), 2); // x, y
        assert_eq!(removed.len(), 2); // b, d
        assert_eq!(context.len(), 2); // a, c
    }

    #[test]
    fn diff_new_only_content() {
        // Only new content (old is empty single line scenario)
        let result = compute_diff("", "single");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].kind, DiffKind::Added);
        assert_eq!(result[0].text, "single");
    }

    // --- snapshot_stats ---

    #[test]
    fn stats_identical() {
        let (added, removed) = snapshot_stats("a\nb", "a\nb");
        assert_eq!(added, 0);
        assert_eq!(removed, 0);
    }

    #[test]
    fn stats_addition() {
        let (added, removed) = snapshot_stats("a", "a\nb");
        assert_eq!(added, 1);
        assert_eq!(removed, 0);
    }

    #[test]
    fn stats_removal() {
        let (added, removed) = snapshot_stats("a\nb", "a");
        assert_eq!(added, 0);
        assert_eq!(removed, 1);
    }

    #[test]
    fn stats_mixed() {
        let (added, removed) = snapshot_stats("a\nb", "a\nc");
        assert_eq!(added, 1);
        assert_eq!(removed, 1);
    }

    #[test]
    fn stats_both_empty() {
        let (added, removed) = snapshot_stats("", "");
        assert_eq!(added, 0);
        assert_eq!(removed, 0);
    }
}
