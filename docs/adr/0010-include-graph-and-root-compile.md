# ADR-0010: Include graph, root-document compile, and the structure sidebar

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

`v0.2.0` introduced the document outline (sections and environments from TexLab's symbol
response) and cross-file go-to-definition. The two remaining pieces of `v0.2.1` are:

1. **Multi-file compile awareness** — when editing an included file (`\input{}`, `\include{}`,
   `\subfile{}`), Galley should compile the project's root document rather than the active file,
   so the proof always reflects the whole document. The `CompileRequest.root_document` parameter
   already existed but was always set to the active path.

2. **A structure sidebar** — the outline panel should show which files the active document pulls
   in, let the user click to open them, and provide a jump-to-anything filter across both
   symbols and included files.

The challenge: the include list must react to the live editor buffer (not the saved file), and
it must be testable at 100% line and branch coverage. Reaching into the Rust layer for a
round-trip on every keystroke is too slow and too hard to test.

## Decision

**Parse include directives in a pure client-side module** (`include-graph.ts`), mirrored in a
pure Rust module (`galley-core::include_graph`). Both modules parse `\input{…}`, `\include{…}`,
and `\subfile{…}` from source text, stripping `%`-comments and trimming whitespace. The result
is a flat list of raw paths in document order. A second function (`resolveIncludePath`) applies
LaTeX's own file-resolution rule: if the last path component has no extension, append `.tex`.

The TypeScript module is the one used in the browser (it runs synchronously on every edit,
derived with Svelte's `$derived`). The Rust module is exported from `galley-core` for future
use (the compile side will want it for dependency tracking). Both modules achieve 100% branch
and line coverage through unit tests. There is no code generation — the two modules are
maintained in parallel by design (they are small and their behaviour is pinned by
cross-language tests).

**Wire the root document into the compile path.** `ProjectController.compile()` reads
`project.rootDocument`; when it is set and differs from the active file, the controller reads
the root file from disk and compiles that instead of the unsaved buffer. This means that when
you are editing an included file, the proof always matches the whole document. The trade-off:
unsaved edits to an included file are not reflected until that file is saved and the root is
recompiled. This is acceptable for `v0.2.1`: included files do not have live preview anyway
because they are not the root, and the behaviour is consistent with how Tectonic resolves
`\input` (from disk, not from a buffer).

**Elaborate the outline panel into a structure sidebar** with two sections: _Includes_ (the
resolved include list, clickable to open) and _Outline_ (the LSP symbol tree, clickable to
jump). A search input at the top filters both sections simultaneously — "jump-to-anything".
The `Outline` section heading is omitted when there are no includes, to avoid an empty visual
slot.

## Alternatives considered

**Round-trip to the Rust layer.** Sending every keypress to Rust would let us reuse a single
parser, but adds latency, complicates the reactive model, and moves testable logic behind I/O.
The parser is 40 lines; duplication is preferable.

**Use TexLab to report the include tree.** TexLab can report workspace symbols and diagnostic
errors for missing files, but not the raw include list in parse order. We need the list
reactively and without a compile, so a dedicated parser is simpler.

**Save before compiling the root.** Forcing a save on every compile would surprise the user and
break the "compile unsaved work" contract that drives the live-preview experience. Reading the
root from disk on demand (only when the active file ≠ the root) is the minimal, safe change.

## Consequences

- The structure panel now shows included files and a search input on every document. When the
  document has no includes, the panel shows only the outline (or the empty state).
- Compiling from an included file now produces a proof of the whole document, which is almost
  always what the author wants.
- Unsaved edits to included files are not previewed until saved. This is documented behaviour
  and will be revisited when live multi-file preview is added.
- The pure include-graph modules are available to future features (dependency tracking,
  the navigator, the include-aware linter).
