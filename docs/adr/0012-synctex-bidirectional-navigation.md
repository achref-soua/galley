# ADR-0012 — SyncTeX Bidirectional Source ↔ PDF Navigation

**Status:** Accepted  
**Date:** 2026-06-19  
**Deciders:** Achref Soua

---

## Context

A local LaTeX IDE without source↔PDF navigation is painful to use. The standard
mechanism is SyncTeX: the TeX engine writes a `.synctex.gz` file mapping every
typeset box to its source file and line. Forward search (cursor → PDF) and inverse
search (PDF click → cursor) are the two user-facing operations.

Galley already compiles via Tectonic inside a Tauri shell. The question is where
to parse SyncTeX and how to connect it to the frontend.

## Decision

### Parser location — `galley-intel` crate

SyncTeX parsing belongs in `galley-intel` (the adapter layer), not `galley-core`
(pure domain types). `galley-core` contributes the `SyncTexMapper` trait and the
`SyncTexBox` / `SyncTexLocation` value types; `galley-intel` provides
`SyncTexParser` as the concrete adapter that reads the gzip-compressed SyncTeX
text format.

### Data flow

1. `tectonic_engine.rs` passes `.synctex(true)` to the `ProcessingSessionBuilder`
   and extracts the resulting `<job>.synctex.gz` bytes from the output bundle.
2. `CompileResult::succeeded` carries `synctex: Option<Vec<u8>>` alongside `pdf`
   and `log`.
3. The Tauri command `compile_document` stores the raw bytes in a `SyncTexState`
   managed-state value (`Mutex<Option<Vec<u8>>>`). No deserialization on the hot
   path.
4. `synctex_forward(file, line)` and `synctex_inverse(page, x, y)` are separate
   Tauri commands that parse on demand and return lightweight DTOs.
5. The frontend holds a `SyncTexBackend` interface with `forward` / `inverse`
   async methods. The real implementation calls `invoke('synctex_forward' | …)`;
   a browser stub returns `null` for both (used in Vitest).

### Coordinate system

SyncTeX coordinates use scaled points (1 pt = 65 781.76 sp). The vertical axis
origin is the top-left of the page (v increases downward). PDF user-space has the
origin at bottom-left (y increases upward). `syncTexToCanvas` converts sp → canvas
pixels accounting for `SCALE = 1.5`. `canvasToPdfPoint` inverts for inverse search
by flipping y: `y_pdf = canvasHeight/SCALE − canvasY/SCALE`.

### Frontend highlight

A 2 s CSS fade-out SVG overlay (`class="synctex-highlight"`) is positioned
absolutely over the canvas inside `.page-wrap`. The ribbon colour (`--ribbon`,
default `#a8362b`) matches the rest of the Galley UI theme. `PreviewPane` derives
the SVG rect from a `$derived` expression guarded by `highlightVisible` state;
a `$effect` arms a `setTimeout` to clear it. `highlightBox` is `null` between
forward searches so the overlay is absent by default.

### Keyboard shortcut

Ctrl+Enter (Cmd+Enter on macOS) triggers forward search. This is standard in
TeXShop, Skim, and most native LaTeX editors — no surprise for the target user.

## Alternatives considered

**Parse SyncTeX in the frontend (TypeScript)** — would avoid a round-trip for
small files, but the parser would need to be duplicated and the binary gzip
handling in the browser adds complexity. The Tauri command boundary is cheap for
this use-case (parse once, cache bytes in managed state).

**Integrate a full SyncTeX C library (libsynctex)** — avoids writing a parser,
but adds a native dependency and complicates cross-platform builds. The SyncTeX
text format is well-specified and small enough to implement directly.

**Store the parsed SyncTexDoc in managed state** — avoids re-parsing per command,
but requires the parsed representation to be `Send + Sync` and makes the state
heavier. Given how infrequently forward/inverse search fires (human-driven), the
parse-on-demand approach is simpler and the latency is imperceptible.

## Consequences

- SyncTeX is enabled unconditionally on every compile. The overhead is minimal
  (Tectonic writes the file anyway when asked).
- `CompileResult` is a wider type; all callers (including `CachedCompiler`) must
  supply the `synctex` field — this is enforced at compile time.
- The `SyncTexState` mutex is uncontended in normal use (sequential Tauri commands
  from one renderer), so no locking complexity arises.
- Synced scroll is explicitly out of scope for v0.3.0 (off by default,
  `PreviewPrefsStore.syncScroll` field reserved for a later release).
