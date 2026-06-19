# ADR-0016 — Visual editor: CM6 decoration layer for rich-text view

**Status:** Accepted  
**Date:** 2026-06-19  
**Deciders:** Achref Soua

## Context

Galley's source pane is a full CodeMirror 6 editor. Users writing prose-heavy documents (theses, papers) want a read-only visual overlay that renders LaTeX markup as formatted text while keeping the raw `.tex` source as the canonical representation. The constraint: no separate rich-text mode that desynchronises from the source; no second parse tree; no AST dependency.

## Decision

Implement the visual layer as a CM6 **decoration-only plugin**:

- A `ViewPlugin` (`visualPlugin`) holds a `DecorationSet` built by `buildVisualDecorations(doc: string)`.
- Three decoration kinds are used: `Decoration.replace` (hides LaTeX command tokens), `Decoration.mark` (applies CSS classes to content spans), and `Decoration.widget` (replaces `\item` with a bullet, and math/image commands with read-only chips).
- The plugin is toggled at runtime via a CM6 `Compartment`, so visual ↔ code mode switches without rebuilding the EditorView.
- All branchy regex parsing is factored into a pure helper module (`visual.ts`) with no CM6 imports, enabling 100 % unit coverage without DOM.

## Alternatives considered

| Option                                                     | Rejected because                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Separate "preview" pane (like VS Code LaTeX Workshop)      | Users want in-editor WYSIWYG, not a side-by-side toggle                                                     |
| Lezer grammar + tree queries                               | Correct for a full parser but overkill for a decoration overlay; couples the feature to grammar maintenance |
| ProseMirror-style dual representation                      | Would require keeping two ASTs in sync; high complexity, risk of divergence                                 |
| CM6 `EditorView.domEventHandlers` with direct DOM mutation | Bypasses CM6's update cycle; breaks undo/redo and ARIA                                                      |

## Consequences

- **Text editing is unchanged.** The decoration layer is additive; removing it (switching to code mode) restores the editor to its plain CM6 state.
- **Cursor and selection work normally.** `Decoration.replace` regions are atomic — the cursor skips the hidden tokens as a unit, which is the expected UX for visual mode.
- **The plugin is read-only in v0.4.0.** Editing through the visual layer (structure editing, inline formatting toggles) is deferred to v0.4.1, where we will intercept mutations through `domEventHandlers` or a dedicated key-command layer.
- **Coverage.** `visual.ts` is 100 % line + branch. `editor.ts` is 100 % via exported helpers (`BulletWidget`, `ChipWidget`, `buildVisualDecorations`) that are tested directly, keeping the CM6 glue thin and the branchy logic in the pure layer.
- **Theme.** Visual-mode CSS classes (`.cm-visual-h1`…`.cm-visual-h6`, `.cm-visual-bold`, `.cm-visual-italic`, `.cm-visual-link`, `.cm-visual-bullet`, `.cm-visual-chip`, `.cm-visual-math`, `.cm-visual-image`) are injected through the existing `editorTheme` extension and respond to Onionskin and Carbon theme tokens.
