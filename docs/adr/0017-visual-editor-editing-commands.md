# ADR-0017 — Visual editor writing commands

**Date:** 2026-06-19  
**Status:** Accepted

## Context

ADR-0016 established a read-only visual decoration layer over the canonical `.tex` source using CM6 `Compartment`, `ViewPlugin`, and `RangeSetBuilder`. The next step is making that layer writable: mapping user keypresses and toolbar clicks in visual mode to minimal, targeted source patches — without ever doing a full parse round-trip that would clobber user formatting or undo history.

## Decision

Editing operations are expressed as `VisualEdit` values — an immutable list of non-overlapping `{ from, to, insert }` changes plus the resulting `{ anchor, head }` selection — computed by pure functions in `visual.ts` and dispatched as a single CM6 transaction. This keeps all business logic testable without a DOM.

**Heading promote/demote (Tab / Shift-Tab):** `lineHeadingCmd` detects the command on the cursor line; `promoteHeading` / `demoteHeading` return the line with the command replaced by its neighbour in the `HEADING_ORDER` canonical array, or `null` when already at the limit. The CM6 commands `visualHeadingDemote` / `visualHeadingPromote` return `false` when the cursor is not on a heading line, letting Tab fall through to `indentWithTab` and Shift-Tab fall through to the default.

**Bold/italic toggle (Ctrl/Cmd+B / I):** `toggleBold` / `toggleItalic` inspect source context around the selection — they detect an existing `\textbf{…}` or `\textit{…}` / `\emph{…}` by checking the raw source bytes before and after `[from, to]`, so they work correctly even when the decoration layer has hidden those bytes from the visible text. The two paths (wrap / unwrap-by-context / unwrap-by-selection-content) are handled by successive guards without mutation.

**`\item` insertion (Enter):** `visualInsertItem` returns `false` unless the cursor is at the very end of an `\item` line with no selection; the new line inherits the same leading whitespace as the current line.

**Key registration:** All five bindings are collected in the exported `VISUAL_KEY_BINDINGS` constant and installed at `Prec.highest` inside a private `visualExtensions()` function that also mounts the `visualPlugin`. `Prec.highest` is required so Tab and Enter override `indentWithTab` / default newline only when the heading/item guards return `true`; when they return `false`, the lower-priority default behaviour runs normally.

**Formatting toolbar (FormatBar):** A `FormatBar.svelte` component is mounted in `App.svelte` inside the `.editor-stack` only when `viewMode === 'visual'`. It exposes four callbacks that forward to the four new `LatexEditor` methods (`toggleBold`, `toggleItalic`, `promoteHeading`, `demoteHeading`). The toolbar uses `editorRef!.method()` (non-null assertion rather than `?.`) because `editorRef` is always non-null when visual mode is active.

**Ctrl+B compile guard:** `onWindowKeydown` in `App.svelte` guards the compile shortcut with `&& viewMode === 'code'` so that Ctrl+B in visual mode reaches the CM6 keymap rather than triggering a compile. CM6 calls `event.preventDefault()` when a bound key is handled, so the event never bubbles to the compile handler.

## Consequences

- All editing operations emit minimal diffs; undo/redo through CM6's `history` extension works correctly across visual and code modes.
- Pure helper functions (`visual.ts`) carry 100% branch/line/function/statement coverage independently of the DOM; CM6 command functions are covered by integration tests that build real `EditorView` instances.
- The `LatexEditor` interface gains four methods; all test doubles (`fakeEditorFactory`, inline factories, EditorPane spy) must implement them.
- Tab on a non-heading line in visual mode still indents (falls through to `indentWithTab`) — behaviour is unchanged from code mode for that case.
