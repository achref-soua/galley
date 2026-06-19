# ADR-0018 — Visual layout: drag-to-reorder sections, image resize, and track-changes review

**Status:** Accepted  
**Date:** 2026-06-19

## Context

v0.4.0 introduced a read-only visual mode; v0.4.1 added in-place editing commands
(bold/italic, heading promotion). The next natural step in the visual-editing story is
layout manipulation — reordering document sections without hunting through source — plus
resizing already-inserted images from the sidebar, caption editing as a pure helper, and
a structured review queue so AI-proposed or batch-replaced edits can be accepted or
rejected one at a time.

## Decision

### Section drag-to-reorder

`parseSectionBlocks(src)` extracts top-level heading blocks (minimum heading level found
in the document) with exact byte extents. `moveSectionBlock` swaps two blocks by slicing
and rejoining the source string, preserving all inter-block text. Both are pure helpers
in `visual.ts`.

`OutlinePanel.svelte` drives HTML5 Drag and Drop: `dragstart` captures the dragged index
in `$state`; `drop` calls the parent `onreorder` callback; `dragend` resets the index.
All drag state lives in the component, keeping the parent (`App.svelte`) clean.

### Image resize

`setImageWidth(src, spec, width)` rewrites the `\includegraphics` options inline. Three
branches handle: (a) replacing an existing `width=` key, (b) appending `width=` to
existing options, (c) inserting `[width=...]` when no options bracket exists. The
component (`AssetPanel.svelte`) surfaces preset buttons (½, ¾, 1×) for every image
already referenced in the document, calling the parent `onresize` callback.

`parseImageWidth(opts)` extracts the current width value from an option string for
display or comparison — shipped as a pure helper alongside `parseCaptions`/`setCaption`
for completeness, with full test coverage.

### Track-changes review queue

`review.ts` defines a minimal, immutable `ReviewEntry` (id + byte range + before/after
text) and four pure operations: `createReviewEntry`, `applyReject` (revert one change in
source), `acceptEntries` (drop from queue), `rejectEntries` (revert + drop). No I/O, no
Svelte state — fully testable in isolation.

`ReviewPanel.svelte` renders the queue: toggle header showing pending count, per-entry
diff view (before → after), Accept/Reject buttons. `onaccept`/`onreject` callbacks
delegate to `App.svelte`, which updates `reviewEntries` (accept drops, reject reverts
source via `projectController.edit`).

`Button.svelte` was extended to forward `aria-label` — a genuine a11y gap that the
review panel surfaced.

### Injection pattern for tests

`App.svelte` accepts `initialReviewEntries?: ReviewEntry[]` to seed the review queue.
The state is initialized with `$state(untrack(() => initialReviewEntries.slice()))` so
Svelte's `state_referenced_locally` compiler warning is suppressed while keeping the
"initial value only" semantics explicit.

## Alternatives considered

- **Temporal workflow for review queue**: ruled out — the review queue is transient UI
  state that does not need durability. A simple array of immutable records is correct.
- **React Flow nodes for sections**: ruled out — the outline panel is a sidebar list, not
  a canvas. HTML5 Drag and Drop is sufficient and has zero extra dependencies.
- **Auto-applying AI edits without review**: ruled out for v0.4.2 — the copilot does not
  yet exist; the review module is the foundation it will build on.

## Consequences

- The outline panel now has a "Sections" drag-list above includes and symbols.
- The asset panel has a "Resize inserted images" section when `\includegraphics` appears
  in the document.
- The review panel appears in the sidebar below the outline panel; it is empty until a
  future AI or batch-replace feature proposes changes.
- `Button` now accepts and forwards `aria-label`, which benefits all callers.
- All new code ships with 100% TS coverage (lines/branches/functions/statements).
