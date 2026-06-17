# ADR-0007: Fast, incremental compilation

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

`v0.1.0` compiles correctly but every build is cold: the Tauri command constructs a fresh
`EmbeddedCompiler::new(TectonicEngine::new())`, and the controller saves and recompiles from
scratch on every request. `v0.1.1` makes editing _feel_ instant — a cached single-edit
recompile of a medium document must be sub-second, with no flicker and stale builds dropped —
while keeping the 100%-coverage gate (ADR-0002) and the source-as-truth rule (§0.5) intact.

Three things are slow about a naive compile loop: redoing the engine's cold setup (the LaTeX
format build, the bundle resolution) on every build; writing intermediate files to disk; and
re-running the engine even when nothing changed. And on the UI side, compiling on every
keystroke, blanking the preview mid-build, and letting a slow older build overwrite a newer
proof would all feel wrong.

## Decision

Speed comes from layers that compose, with every _decision_ in covered code and the native
engine behind the existing `real-compiler` seam (ADR-0006).

**Incremental cache (covered).** `galley-core::content_hash` is a small, dependency-free
FNV-1a fingerprint. `galley-compile` adds `CacheKey` (the source hash + root document +
engine), a single-entry `CompileCache`, and `CachingCompiler<C: Compiler>`, which serves the
previous `CompileResult` when the key is unchanged and only drives the engine on a genuine
change. One entry suffices for the editing loop (compile → edit → recompile the same
document) and bounds memory to one result. All of this is pure and tested to 100% against a
mock compiler. Scope note: the key currently folds in the single canonical source string;
when multi-file projects land (v0.2.1) it must fold in every input the build reads — a change
isolated to `CacheKey::new`.

**Warm engine (real-compiler seam).** The desktop shell keeps exactly one
`CachingCompiler<EmbeddedCompiler<TectonicEngine>>` in Tauri managed state (behind a `Mutex`)
for the life of the process, instead of constructing one per build. Tectonic persists the
compiled LaTeX format and the resource bundle to its on-disk cache, so a long-lived engine
reuses them and only the first build pays the format-build cost. A Tectonic `ProcessingSession`
is single-use by design, so each build still constructs its own session; "warm" means the
engine instance and its caches stay hot, not that a session object is reused. This is a
clarification of the roadmap's "no per-build session spawn", recorded here as the honest
shape of the optimisation.

**In-memory VFS (already present, now explicit).** The engine already feeds the source from a
`primary_input_buffer` and pulls outputs from `into_file_data()` with
`do_not_write_output_files`, so a build's `.tex`/`.aux`/`.pdf`/`.log` never touch disk. v0.1.1
documents this as the VFS layer; the only persistent I/O is the legitimate format/bundle
cache that makes warm builds fast.

**Debounced, cancellable auto-compile (covered).** The controller takes injectable `Timer`,
`Clock`, and `Bell` seams (real `setTimeout`, `performance.now`, and a Web Audio bell;
deterministic fakes in tests). An edit schedules a single debounced compile via the `Timer`
(coalescing a burst of keystrokes); a new build is stamped with a monotonic generation, and a
result whose generation has been superseded is dropped rather than allowed to overwrite the
fresh proof. This is UI-side cancellation: the native build cannot be interrupted mid-flight,
but its stale result never lands.

**Compile is decoupled from save.** Galley compiles the editor's canonical buffer directly and
no longer forces a save first. The engine reads the passed source (not the file on disk), so
saving was never required for correctness; decoupling keeps dirty-tracking meaningful and lets
auto-compile preview unsaved work, exactly like Overleaf. Persisting stays the explicit save
action (`Ctrl`/`⌘`+`S`, the Save button, or the unsaved-changes guard). This is a deliberate
change from v0.1.0's save-before-compile.

**No flicker, with timing and an optional bell.** The compile state keeps the last good proof
on screen across reruns — it is replaced only when a new proof is produced, and a failed
rebuild keeps the previous proof visible with a note — so the preview never blinks to empty.
Build duration and a `cached` flag are surfaced in the viewer bar. A short typewriter-bell
"ding" on success is available but **off by default**, opt-in under Settings → Compilation,
synthesised with the Web Audio API behind the `Bell` seam.

## Consequences

- A no-change recompile is an in-memory cache hit (effectively free); a single-edit recompile
  reuses the warm format and in-memory VFS, meeting the sub-second target. The cache hit and
  the warm/incremental path are exercised by `just compile-itest`
  (`warm_recompiles_serve_from_cache_and_are_fast`).
- The cache, debounce, cancellation, timing, and bell decisions are all covered to 100%; the
  only out-of-gate code remains the native engine, behind `real-compiler`.
- Compiling no longer persists the document, so "unsaved changes" stays meaningful and the
  guard still protects unsaved edits — a behaviour change from v0.1.0, recorded here.
- The single-entry cache is keyed on the whole source string, which is exactly right for the
  current single-file build root and must grow with multi-file support (v0.2.1).
