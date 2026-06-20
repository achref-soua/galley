# ADR-0027 — Export formats and architecture

**Date:** 2026-06-21  
**Status:** Accepted

## Context

v0.6.4 adds the ability to export a compiled Galley project in multiple formats:
PDF, clean source ZIP (Overleaf-ready), share bundle (source + PDF in one ZIP),
HTML/Word/Markdown via Pandoc, and the system print dialog. This requires decisions
on module boundaries, the save-dialog API, and graceful degradation when Pandoc is
absent.

## Decisions

### 1. Pure domain type in `galley-core`

`ExportFormat` is a pure enum with label/extension/filename helpers and a
`pandoc_format()` predicate. No I/O, no serde derives. This keeps 100% region
coverage achievable and lets the intelligence plane reference the type without
pulling in any binary dependencies.

### 2. `export_share_bundle` in `galley-import`

The share-bundle builder (source ZIP + embedded PDF) belongs in `galley-import`
alongside the existing `export_clean_bundle`, because it is a pure archive
operation over a `Workspace` value. The PDF bytes are passed in as `&[u8]` so the
function has no dependency on the compile layer.

### 3. `ExportBackend` seam in the desktop front-end

A small TypeScript interface (`ExportBackend`) separates the `ExportPanel` UI from
the Tauri command layer, mirroring the established `ImportBackend` pattern. The
runtime selector checks `'__TAURI_INTERNALS__' in window` and returns either the
Tauri adapter or a no-op browser stub. This makes the panel fully testable in
Vitest/jsdom without any Tauri runtime.

### 4. File-save dialog reuse

`ExportPanel` reuses `ImportBackend.pickSavePath` for all save dialogs rather than
adding a redundant method on `ExportBackend`. One dialog entry point, one mock to
stub in tests.

### 5. Pandoc: graceful degradation, not a hard requirement

Pandoc (HTML/Word/Markdown export) is optional. The Tauri command maps
`ErrorKind::NotFound` to a friendly "Pandoc is not installed" message. The UI shows
Pandoc cards at all times; if Pandoc is absent the user sees a clear error in the
status area rather than a hidden button. `checkPandoc` allows callers to probe
availability without triggering a real conversion.

### 6. Print via Blob URL

Browser-side printing uses a temporary `blob:` URL opened in a new tab with
`window.print()` on load, then immediately revoked. No server round-trip, no
temporary file on disk, no Tauri command required.

## Consequences

- All seven export paths are covered by unit tests with 100% TS line/branch/function
  coverage and zero dependency on a real filesystem or Tauri runtime.
- Pandoc is not a hard dependency; operators who do not need HTML/Word/Markdown
  export need not install it.
- The `ExportBackend` interface is the single extension point for future export
  targets (e.g. ePub via Pandoc, ODT).
