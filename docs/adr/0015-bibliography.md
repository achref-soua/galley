# ADR-0015 — Bibliography (v0.3.4)

**Status:** Accepted  
**Date:** 2026-06-19

## Context

Scholarly LaTeX documents cite references from a `.bib` database. v0.3.4 makes Galley a
first-class citizen of that workflow: manage the project's `.bib`, look references up by DOI or
arXiv id, complete `\cite` keys as you type, and — crucially — actually render the bibliography.
BibTeX and biblatex must both work, and the established constraints still hold: a 100% coverage
gate, the `.tex`/`.bib` source as the single source of truth, and network access kept opt-in and
out of the WebView.

The acceptance is end to end: **DOI → entry added → `\cite` completes → bibliography renders.**

## Decision

### 1 — A pure, hand-rolled `.bib` parser in `galley-core`, mirrored in TypeScript

`galley-core::bibliography` parses and serializes `.bib` with a small cursor-based parser (no
`regex`, no `serde`), tolerant of malformed and truncated input and of both BibTeX and biblatex.
Keeping it dependency-free keeps the 100% region gate tractable (every error/edge branch is
reachable from a fixture) and the domain logic available to any future non-desktop surface.

`bibliography.ts` is a faithful TypeScript mirror, so the project's `.bib` files parse
client-side with no IPC round-trip — exactly the dual-maintenance decision made for the include
graph (ADR-0010). The grammar is small and stable; the parallel tests transfer between the two.

### 2 — DOI content negotiation reuses the `.bib` parser; arXiv gets a dedicated mapper

DOI lookups use `https://doi.org/{doi}` with `Accept: application/x-bibtex`, which returns BibTeX
directly — so the response feeds straight into `parse_bib` with no second format to maintain (and
it covers DataCite as well as Crossref). arXiv has no BibTeX endpoint, so `arxiv_atom_to_entry`
extracts the entry from the Atom feed with a tiny hand-rolled tag reader (again, no `regex`, to
keep coverage clean).

The HTTP request lives in the (coverage-excluded) Tauri shell via `ureq`, so reference egress
stays in the Rust core rather than the WebView (avoiding CORS and keeping a single place to gate
network access later). A `BibBackend` seam (`bib-backend.ts`) abstracts it: the packaged app
forwards to the command; the browser and tests return a deterministic stub, so the whole
add-a-reference flow is driven without a network.

### 3 — On-disk resolution via Tectonic's `filesystem_root`

Until now the engine compiled only the primary source buffer, so `\bibliography{refs}`,
`\input`, and on-disk images never resolved — a bibliography could be managed but never rendered.
`CompileRequest`/`BuildPlan` now carry an optional `project_root`, threaded into the embedded
Tectonic engine as `filesystem_root`. With it, Tectonic reads sibling files from the project and
runs the bibliography pass (bibtex/biber) automatically. This is a genuine correctness win beyond
bibliography: `\input`-ed chapters and disk images now render too. Verified by an `#[ignore]`d
integration test that compiles a document citing an on-disk `refs.bib` and asserts the citation
resolves.

The single-entry compile cache is keyed on the source buffer, so editing a `.bib` without
touching the `.tex` does not bust it — the same external-file caveat that already applies to
`\input` and images. The common flow (look up → insert `\cite{…}`) changes the source, so it
recompiles naturally.

### 4 — Citation completion from parsed entries, with the LSP deferring inside `\cite`

A dedicated completion source offers `.bib` keys when the cursor is inside a `\cite`-family
argument (`citeContext` recognises biblatex's `\autocite`, `\textcite`, `\parencite`, `\nocite`,
… and multiple comma-separated keys). The TexLab completion source defers inside a cite argument,
so keys come from one place — the project's parsed entries, including ones added but not yet
saved — and never double up with the language server's own citation completions. In the browser
and tests (no TexLab) this is the sole, deterministic mechanism, so the acceptance is exercisable
without a language server.

### 5 — Bibliography state and actions live in `ProjectController`

The controller parses every `.bib` file in the project into its state on open, exposes
`citeCandidates()`, and owns `addReference()` (look up, append to the `.bib`, register the file,
reload) and `importBibText()` (merge a `.bib` export — e.g. from Zotero — skipping duplicate
keys). Keeping the logic in the controller keeps it directly testable against a fake backend;
`BibPanel.svelte` is a thin view, consistent with the rest of the app.

## Consequences

- `galley-core` gains a tested bibliography module (parser/serializer/keygen/arXiv) at 100%
  region/line/function coverage; `ureq` joins the desktop shell only (the isolated src-tauri
  workspace), so the root `cargo audit` and the coverage gate are unaffected.
- Bibliographies, `\input`-ed files, and on-disk images now render — a standing limitation
  closed. "Zotero import" is delivered as a `.bib` import, since Zotero exports `.bib`.
- Frontend: 626 tests, 100% lines/branches/functions/statements. Rust: 100% region coverage; the
  bibliography-render acceptance verified by a manual integration test.
