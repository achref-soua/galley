# ADR-0009: Language intelligence via TexLab (LSP)

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

Through `v0.1.x` the editor could highlight, fold, compile, and explain a failed build, but it
had no understanding of LaTeX: no completion for commands, environments, packages, `\ref`/`\cite`
keys, or file paths; no hovers; no go-to-definition; no document outline; and no diagnostics
beyond what the compile log yields. `v0.2.0` adds that intelligence by integrating **TexLab**, a
mature Rust LaTeX language server (§5), behind the `LanguageIntelligence` port (§4.2).

TexLab speaks LSP over a child-process pipe — real I/O, like the Tectonic engine. The challenge
is the same as for compilation: keep the heavy, native dependency out of the build and coverage
gates while still exercising every decision the integration makes.

## Decision

**A `LanguageIntelligence` port in `galley-core::intel`, with pure domain types.** The port
defines `completion`, `hover`, `definition`, `symbols`, and `diagnostics` over a `TextDocument`
and a zero-based `Position`. The shared types (`CompletionItem`/`CompletionKind`, `Hover`,
`Location`, `DocumentSymbol`/`SymbolKind`) are plain data, exercised to 100% with unit tests.
Positions stay zero-based (LSP) below the UI boundary; the editor converts to Galley's one-based
lines in one place.

**The protocol, framing, and mapping are pure and always built; only the process is gated.** A
new crate module set in `galley-intel`:

- `framing` — the LSP `Content-Length` base protocol (encode a payload; reassemble a byte stream
  into whole messages), pure over byte buffers.
- `protocol` — JSON-RPC request/notification building and incoming-message classification
  (response / error / server-request / notification), plus request-id correlation. Built on
  `serde_json`'s **untyped `Value`** with no derive macros, so every branch is ours to cover.
- `mapping` — turning LSP result JSON into the domain types. This is where TexLab's real-world
  quirks are pinned down, verified against a live TexLab 4.3: completion comes back as a
  `CompletionList` whose items are all `kind: 1` (the real category is the item's `data` tag, so
  that is what we classify on); definitions are `LocationLink[]`; document symbols are
  hierarchical with section/float/equation kinds. Diagnostics are mapped to the existing
  `Diagnostic` shape via a new `Diagnostic::lint` constructor and a `DiagnosticKind::Style`
  kind, with the zero-based LSP line shifted to Galley's one-based convention.

The live client, `TexLabClient`, spawns `texlab` and drives the LSP lifecycle synchronously
(Tauri serializes requests through a `Mutex`; a language server answers one at a time). It is
compiled only under the **`real-lsp`** Cargo feature — off for `cargo build`/`clippy`/`llvm-cov
--workspace`, on for the desktop shell — exactly mirroring `galley-compile`'s `real-compiler`
seam. It is exercised by `#[ignore]`d integration tests (`just lsp-itest`) against a real
TexLab, which verify completion, **cross-file** `\ref` completion, **cross-file**
go-to-definition, document symbols, and the diagnostics round-trip.

**The Tauri handlers stay thin.** `lsp_completion`/`lsp_hover`/`lsp_definition`/`lsp_symbols`/
`lsp_diagnostics` convert arguments, run the warm client (started once per project, kept in
managed state like the compiler), and map results to DTOs. If `texlab` is not on `PATH`, the
client fails to start and the commands degrade to empty results — the editor stays usable
without a language server installed.

**The frontend mirrors the project-backend seam.** A `LanguageBackend` interface has a Tauri
adapter (invokes the commands over IPC) and an in-memory browser fake (deterministic completion,
hover, definition, and symbols), so vitest and Playwright drive the editor's language features
with no live server. Completion uses `@codemirror/autocomplete`; hovers use `hoverTooltip`;
go-to-definition is an `F12` command. All decision logic — completion-token start, offset↔LSP
position, LSP-kind→CodeMirror-type mapping, the hover/definition handlers — lives in exported
pure helpers tested directly, keeping the CodeMirror glue thin.

**LSP diagnostics merge into the existing surface.** The compile log's diagnostics and the
language server's (ChkTeX style notes and TexLab's own analysis) are combined by a covered
`mergeDiagnostics` helper — log first, server diagnostics that exactly repeat a log one dropped
— and flow into the same gutter and problems panel built in `v0.1.2` (ADR-0008). The document
outline is surfaced in a minimal, clickable `OutlinePanel`; the full structure sidebar with the
include graph and multi-file navigation is `v0.2.1`.

## Consequences

- The editor now completes, explains, navigates, and outlines LaTeX, with live diagnostics — a
  genuine step up in authoring, all on a local, private language server.
- The 100%-coverage gate stays honest without a language server: the framing, JSON-RPC, and
  mapping decisions are pure and fully tested against fixtures captured from real TexLab output;
  the live process is feature-gated and itest-verified.
- **Scope, recorded honestly:** the compile build root is still single-file (ADR-0007/0008), but
  the language server indexes the whole project, so completion and go-to-definition already work
  across files (verified by the `real-lsp` itests). Multi-file **compile** root awareness, and
  the richer structure sidebar consuming these symbols, are `v0.2.1`. ChkTeX diagnostics require
  a `chktex` binary on the host; without it, TexLab still provides its own analysis, and the
  merge path is exercised regardless.
- `texlab` joins Tectonic's C dependencies as a documented host requirement for the packaged app
  and the itests; the gate never needs it.
