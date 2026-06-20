# ADR-0023 — Git-backed version history

**Status:** Accepted  
**Date:** 2026-06-20

## Context

Galley saves LaTeX documents to disk but has no built-in version history. Users who want to roll back to an earlier state must rely on the host OS (Time Machine, filesystem snapshots) or external VCS, neither of which is available inside the app itself.

The in-memory checkpoint store added in v0.5.3 (`galley-core::checkpoint`, `autonomous.ts`) lives only for the lifetime of a single agent session and is erased on close. We need durable, per-project history that persists across restarts and is stored alongside the document.

## Decision

Store version history as commits inside the project's own git repository, under the hidden ref `refs/galley/checkpoints`. This keeps all history inside the project directory (portable, discoverable, works with any git host), never interferes with the user's own git commits on `main`/`HEAD`, and lets us use git's content-addressed storage for deduplication at zero extra cost.

### Design

**Trait seam** (`galley-vcs::CheckpointHistory`) mirrors the `galley-compile::LatexEngine` pattern:

- `InMemoryHistory` — always compiled, drives 100 % unit-test coverage at zero I/O cost.
- `Git2History` — compiled only under `features = ["real-vcs"]`, backed by `libgit2` (the `git2` crate). Its tests are `#[ignore]`d (integration) and run via `just vcs-itest`.

**Tauri commands** (`vcs_auto_checkpoint`, `vcs_create_snapshot`, `vcs_list_checkpoints`, `vcs_get_content`) expose the history to the frontend.

**TypeScript layer** (`vcs.ts`, `vcs-backend.ts`, `HistoryPanel.svelte`):

- `computeDiff` / `diffStats` — LCS-based pure diff identical in semantics to the Rust implementation in `galley-core::vcs`.
- `VcsBackend` interface with `tauriVcsBackend()` (production) and `browserVcsBackend()` (tests, Playwright) selected at runtime via `selectVcsBackend()`.
- `HistoryPanel.svelte` — sidebar panel showing the checkpoint timeline, a compact diff viewer (added/removed lines only, no context), revert button, and a named-snapshot form.

**Auto-checkpoint on save** — `handleSave` in `App.svelte` calls `vcsBackend.autoCheckpoint()` after every successful disk write so history builds passively without user action.

## Consequences

**Good:**

- Zero-dependency history for every project, stored portably inside the project folder.
- Named snapshots let users mark important milestones (pre-submission, before major restructure).
- The diff viewer gives instant visual feedback without opening an external diff tool.
- The trait seam keeps the Rust workspace at 100 % line/region/function coverage without mocking I/O.

**Trade-offs:**

- `refs/galley/checkpoints` is a non-standard ref; external git tools show it only if the user explicitly fetches it. This is intentional isolation, not a bug.
- `git2` adds ~3 MB to the Tauri binary (statically linked). Acceptable for the feature value.
- The LCS diff is O(m×n) in the number of lines. Documents with thousands of lines will have perceptible diff latency in the panel; a future optimization can cap the diff at N lines or switch to a streaming approach.
