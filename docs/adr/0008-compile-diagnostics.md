# ADR-0008: Compile diagnostics from the TeX log

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

Through `v0.1.1` a failed build showed the user the **raw TeX log** in the preview — a wall of
bundle paths, font notes, box statistics, and, somewhere inside, the one line that matters,
written in TeX's own idiom (`! Undefined control sequence.`, `l.42`, `on input line 9`,
`at lines 12--14`). That is exactly the experience Galley exists to replace (§2.7: a patient
print-shop editor, not a compiler). `v0.1.2` turns the log into **structured diagnostics** the
UI can show as inline gutter markers and a problems panel with jump-to-source, each carrying a
plain-language explanation and a fix tip for the common offenders.

The raw log already reaches the UI end to end (ADR-0006/0007: `CompileResult.log` →
`CompileDto.log` → the frontend compile state). The new work is parsing it, and surfacing the
result without scattering parsing logic across the components or leaving it uncovered.

## Decision

**The parser lives in `galley-core::diagnostics` — pure, dependency-free Rust.** `parse_log`
reads the log line by line and returns `Vec<Diagnostic>`, each a `{ severity, kind, message,
file, line, explanation }`. A `! …` line opens an error whose location is filled in from the
following `l.<n>` context line (which also names the offending control sequence); `LaTeX
Warning:` and `Package … Warning:` lines become warnings carrying their `on input line` number;
`Overfull`/`Underfull` lines become bad boxes carrying their line range. Thirteen kinds cover
the top offenders — undefined control sequence, missing `$`, runaway argument, mismatched
environment, file-not-found, package error, generic LaTeX/TeX error, undefined reference,
undefined citation, generic LaTeX warning, package warning, overfull and underfull boxes — and
each kind maps to a fixed severity and an in-voice explanation. There is **no `regex`
dependency**: the parsing is hand-rolled with `str` methods, matching the crate's existing
dependency-free ethos (the manifest parser, the FNV hash, the ISO-8601 helper) and keeping the
100%-region coverage gate (ADR-0002) tractable with a corpus of fixture log snippets.

**The desktop shell parses the log it already captured.** The thin `compile_document` command
calls `parse_log` on the result's log and ships the diagnostics on `CompileDto` alongside the
log and PDF. The handler stays thin (one call into the covered core); the engine seam and the
warm-compiler state are unchanged.

**The frontend keeps only display decisions.** `diagnostics.ts` holds the small, fully-covered
helpers — counting and summarising, labelling a location, ordering and de-duplicating for the
panel. The editor's gutter is a CodeMirror `StateField` + `GutterMarker` gutter whose marker
positions come from a pure `markerSpecs` helper (one marker per line, worst severity wins,
clamped into range); jump-to-source is a `gotoLine` that clamps the line and scrolls the cursor
to it. The `ProblemsPanel` component is thin: it renders `problemList(diagnostics)` and emits a
jump request, which the app turns into a stamped reveal so clicking the same problem twice
re-jumps.

## Consequences

- A failed build now reads as guidance, not a transcript. The raw log stays available in the
  preview for power users, but the structured diagnostics are the primary surface.
- All parsing, classification, and explanation copy is in one pure module, tested to 100% on
  fixtures with no engine — the explanations can be tuned without touching the UI.
- **Scope, recorded honestly:** the build root is a single file (ADR-0007), so a source _file_
  is attached to a diagnostic only when the log names one directly (a missing
  `\input`/package/graphic). Attributing every diagnostic to a file across an include graph
  waits for multi-file awareness (v0.2.1), where there is a graph to attribute against. The
  line number — the locator the editor jumps to — is extracted wherever TeX prints one.
- The next intelligence release (v0.2.0, TexLab) will merge ChkTeX/LSP diagnostics with these
  log-derived ones; the `Diagnostic` shape is the natural meeting point.
