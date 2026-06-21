# ADR-0029 — Performance & low-spec (v0.7.1)

**Status:** Accepted  
**Date:** 2026-06-21  
**Deciders:** Achref Soua

---

## Context

Galley promises to feel instant on a modest laptop (master plan §1, §8.2). Before
the beta, the performance budgets need to be written down, enforced where they can
be, and the obvious low-spec hazards addressed: a cold start that drags, recompiles
that thrash on every keystroke in a large document, heavy modules loaded eagerly,
and an ever-growing UI bundle.

The budgets from §8.2 are:

- Cold start to interactive: ≤ 2.5 s
- Idle RAM (incl. a warm engine): ≤ ~150 MB
- Cached single-edit recompile (medium doc): sub-second
- UI interaction latency: ≤ 16 ms frame budget
- Installer / bundle: small (Tauri-class)

---

## Decisions

### 1. One performance-budget policy, mirrored in Rust and TypeScript

The budgets live as data in `galley-core::perf` (`PerfBudget::REFERENCE`,
`Measurement`, `BudgetReport`, `evaluate`) and are mirrored verbatim in
`perf-budget.ts` (`REFERENCE_BUDGET`). Both are pure and exercised to 100 %
coverage. Keeping the numbers in code — not just prose — means a captured
measurement can be classified mechanically and the bundle gate can share the same
constants.

### 2. The auto-compile debounce scales with document size

A fixed debounce either feels sluggish on small documents or thrashes the engine
on large ones. `adaptive_debounce_ms` / `adaptiveDebounceMs` add 1 ms of delay per
512 bytes on top of a 250 ms floor, clamped to a 1500 ms ceiling.
`ProjectController.edit` applies `max(configured, adaptive(size))`, so a 100-page
document coalesces a burst of keystrokes into one build while a short note still
recompiles almost immediately.

### 3. Lazy loading via memoised dynamic imports

The two heaviest dependencies — MathLive and PDF.js — are already dynamically
imported, so Vite code-splits them into separate chunks that load on demand. v0.7.1
adds `startup.ts::once` to memoise those dynamic imports (`pdf.ts` resolves
`pdfjs-dist` and its worker once per session, not per render) and `deferIdle` for
pushing non-critical work past first paint. The result: the initial bundle stays
small and the engine/worker resolve a single time.

### 4. A UI bundle-size gate in `just ci`

`scripts/ci/bundle-gate.sh` sums the gzipped size of the built JS + CSS and fails
above the budget (1536 KiB). It runs after `build` in `just ci`. The pure
comparison logic (`evaluateBundle`) is unit-tested; the script is a thin I/O seam,
consistent with the other `scripts/ci/*.sh`.

### 5. Import is progress-reported

`import-progress.ts` models the ordered phases of an import with in-voice labels
and a completion percent. The wizard surfaces the current phase while a project is
brought in, so a large import is never a silent spinner.

---

## Consequences

- The budgets are now a checked artifact, not an aspiration: the bundle gate is
  enforced every run, and `evaluate` lets future measurement harnesses assert the
  runtime budgets.
- Large documents stay responsive without disabling auto-compile.
- Heavy modules cost their weight once, and only when first needed.
- Cold-start RAM and timing on the reference machine are measured manually (no
  automated profiler in the local gate yet); the numbers are recorded in
  `docs/performance.md` rather than fabricated.
