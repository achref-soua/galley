# ADR-0013 — Assets & Figures: Image Insertion Workflow

**Status:** Accepted  
**Date:** 2026-06-19  
**Deciders:** Achref Soua

---

## Context

A LaTeX document that includes figures needs image files to be reachable by the TeX
compiler. In a self-contained Galley project the natural location is an `assets/`
sub-directory of the project root. The user needs a way to:

1. Copy image files into that directory from the host OS.
2. Insert the corresponding `\includegraphics` command at the cursor.
3. Be reminded to add `\graphicspath{{assets/}}` if the document does not already have one.

The challenge is the sandbox constraint: `SafeRoot` (ADR-0005) prevents all file I/O
outside the project root, including arbitrary binary writes. The existing `SafeRoot::write`
only accepts `&str`, so image data (arbitrary bytes) could not be written without an extension.

## Decision

### Binary file write in `galley-security`

Add `SafeRoot::write_bytes(&self, rel: &str, contents: &[u8])` with identical sandbox logic
to `write` (path decomposition, `assert_within` traversal check, symlink check on the final
component) but accepting `&[u8]`. This is a minimal extension — no new abstraction, same
security invariants.

### Tauri commands

Two shell-layer commands are added to `apps/desktop/src-tauri/src/lib.rs` (excluded from
coverage per ADR-0002):

- `copy_asset(root, src_bytes, filename)` — sanitises the filename (strips directory
  components, replaces control characters and illegal path chars with `_`), writes the bytes
  to `assets/<clean_name>` via `SafeRoot::write_bytes`, returns the relative path.
- `list_assets(root)` — returns all entries from `SafeRoot::list()` whose path starts with
  `"assets/"`.

### Frontend seam (`asset-backend.ts`)

Follows the established backend-seam pattern (ADR-0005, ADR-0011): a `tauriAssetBackend`
that invokes the Tauri commands, a `browserAssetBackend` (in-memory `Map`) for jsdom tests,
and a `selectAssetBackend(win)` detector. Injected into `App` via the `assetBackend` prop so
tests can supply the browser backend without any environment detection.

### `insertAtCursor` on `LatexEditor`

The asset panel and drag-drop handler need to insert a snippet at the current cursor
position. This is added as a method on the `LatexEditor` interface (and implemented via
`view.dispatch(view.state.replaceSelection(text))` in `createLatexEditor`). The fake editor
in `tests/setup.ts` appends the text to `area.value` and fires `onChange` so integration
tests can observe the insertion.

### `\graphicspath` banner

Rather than silently inserting `\graphicspath{{assets/}}` on first use, a non-blocking
inline banner is shown above the editor whenever:

- a project is open, and
- the document contains `\includegraphics` but not `\graphicspath`, and
- the banner has not been dismissed this session.

The "Add" action calls `insertGraphicspath(source)` (inserts before `\begin{document}`, or
appends), updates the project content via `projectController.edit`, and sets a session-local
`graphicspathBannerDismissed` flag. "Dismiss" sets the flag without editing. The flag is
not persisted — it resets on reload, so the banner reappears if the user later opens another
document that still lacks `\graphicspath`.

### OS drag-and-drop

A `handleDrop` listener on the `.editor-area` div copies the first dropped file into
`assets/` via `assetBackend.copyAsset` and calls `editorRef!.insertAtCursor(snippet)`.
Guards: skip if no project is open, if `dataTransfer` is null/undefined, or if no files were
dropped.

## Consequences

- Image files are copied into the project sandbox under `assets/`, keeping all project
  material self-contained and portable.
- No new I/O surface outside `SafeRoot`; the sandbox invariants from ADR-0005 are preserved.
- The `LatexEditor` interface gains one method; all existing fake implementations updated.
- The `\graphicspath` banner is session-local (not persisted), which is intentional: it
  costs nothing to show and avoids a settings screen or localStorage key for a one-time hint.
