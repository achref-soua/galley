# ADR-0025 — Project organization: registry, window backend, and dashboard

**Status:** Accepted  
**Date:** 2026-06-20

## Context

Galley v0.6.1 and earlier opened exactly one project per window with no persistent awareness of
which projects the user had worked on before. There was no way to:

- Switch to a recently opened project without going through the OS file picker.
- See all projects at a glance and filter or search them.
- Tag projects for personal organization (e.g., "phd", "work", "draft").
- Open a brand-new window from within the app.

The absence of these features pushes users back to the OS file system for navigation, breaking
the editor's focus-first experience.

## Decision

Ship three closely coupled pieces in a single PR set:

### 1. `ProjectRegistry` (localStorage, pure TypeScript)

A class wrapping `localStorage` (injected via a `Pick<Storage, 'getItem' | 'setItem'>` interface
for testability). It owns a single key `galley.projects` storing a `RegisteredProject[]` JSON blob.
Each entry carries `{ root, name, tags, lastOpened }`.

**Key choices:**

- **localStorage, not Tauri's fs plugin.** The registry is UI state, not document content. It
  does not need to survive an uninstall or a profile migration. localStorage is synchronous, always
  available in the webview context, and trivially testable without Tauri.
- **`upsert` on open, not on create.** Registering a project is a lightweight idempotent write
  triggered whenever the user actually opens a project. There is no need for a separate "add to
  registry" flow.
- **Sorted by `lastOpened` descending** at read time so the most recently used project is always
  first. Projects never opened (`lastOpened: null`) sort last.
- **Tags stored on the registry entry, not on the project disk.** Tags are a personal organization
  layer; they do not belong in the `.galley/` directory (which is shared, e.g., in a git repo).
- **`search(query, filterTag?)` method** delegates to `searchProjects` (a pure, separately tested
  function) to keep the class thin and keep the search logic independently testable.

### 2. `WindowBackend` interface

A minimal injectable interface:

```typescript
interface WindowBackend {
  openInNewWindow: () => Promise<void>;
}
```

Two implementations:

- `tauriWindowBackend()` — calls `openUrl(currentOrigin)` via the Tauri shell plugin, reusing the
  existing window management already in place for the AI panel.
- `browserWindowBackend()` — no-op that returns `Promise.resolve()`, used in tests.

`selectWindowBackend()` picks at runtime based on `window['__TAURI_INTERNALS__']`.

**Rationale:** The dashboard's "New window" button must open a new Tauri webview window without the
app needing a `WebviewWindow` Rust command. Reusing `openUrl` with the current origin is the
simplest approach that works with no new Rust surface area.

### 3. `ProjectDashboard.svelte` (full-screen overlay)

A full-screen panel (CSS `position: fixed; inset: 0`) rendered inside `App.svelte` controlled by
an `$state` boolean `showDashboard`. It is not a route — toggling it is instant and avoids the
overhead of a navigation event.

**Reactivity via generation counter:** `ProjectRegistry` is a plain class; Svelte 5 cannot observe
its mutations. Rather than wrapping the internal list in Svelte state (which would require exposing
the class's innards), a `generation` counter (`$state(0)`) is incremented after every mutating
call (`remove`, `addTag`, `removeTag`). The two derived values (`filtered`, `knownTags`) read
`generation` so they re-evaluate on any mutation. This is a deliberate, documented pattern.

**Tag chips vs filter pills:** The same tag string appears in two contexts — as a clickable filter
pill at the top of the panel and as a chip on each card. These are visually differentiated via
`.tag-chip` (clickable, can be toggled) vs `.tag-chip.small` (static, with a remove button).

**In-panel tag editing:** Add and remove are handled inline without a separate dialog. Clicking `+`
on a card opens a small text input in-place; Enter/blur confirms, Escape cancels. This keeps focus
within the card and avoids z-index stacking issues with a modal-on-modal approach.

## Alternatives considered

| Alternative                             | Why rejected                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| IPC to a Tauri command for project list | Unnecessary round-trip; no persistence need beyond the current webview profile.                                       |
| A dedicated route / navigation          | Heavier than a toggled overlay; breaks the single-window, keyboard-first feel.                                        |
| Svelte 5 `$state` on the registry list  | Would require exposing `#list` or converting it to a Svelte store; more invasive than the generation counter pattern. |
| Tags in `.galley/` config               | Tags are personal, not collaborative; storing them in the project directory would pollute shared repositories.        |

## Consequences

- `ProjectRegistry` is tested in full isolation (100 % Vitest line + branch coverage).
- `WindowBackend` is fully injectable; the Tauri-specific branch is covered by a test that
  temporarily sets `window['__TAURI_INTERNALS__']`.
- `ProjectDashboard` has 32 unit tests covering all user-visible behaviours, including the
  compiler-generated `?? ''` null-safety guard in the tag-chip each block (covered by a test that
  passes a null-ish tag through a registry stub, documenting that the UI degrades gracefully on
  corrupted localStorage data).
- The Svelte 5 `?? ''` null-coalescing branch in unkeyed `{#each}` text interpolations is a
  known compiler artifact. The canonical fix is to test the boundary condition (null item in the
  iterable), which both covers the branch and documents real-world resilience.
