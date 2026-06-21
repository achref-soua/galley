# Performance & low-spec

Galley is built to feel instant on a modest laptop. This page records the budgets
it commits to, how each one is met, and how to measure them. The budgets live in
code — `galley-core::perf` (`PerfBudget::REFERENCE`) and `perf-budget.ts`
(`REFERENCE_BUDGET`) — so they are a single source of truth, not just prose.

## The budgets (reference machine)

| Metric                                | Budget        | How it is met                                                                                                                 |
| ------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Cold start to interactive             | ≤ 2.5 s       | Tauri 2 native WebView (no bundled browser); compile-time Svelte 5 reactivity; heavy modules code-split and loaded on demand. |
| Idle RAM (incl. a warm engine)        | ≤ ~150 MB     | Rust core + native WebView; no Node runtime in the shipped app.                                                               |
| Cached single-edit recompile (medium) | sub-second    | Warm embedded Tectonic with a content-hash cache (v0.1.1).                                                                    |
| UI interaction latency                | ≤ 16 ms frame | Adaptive auto-compile debounce keeps large documents off the keystroke path.                                                  |
| UI bundle (gzipped JS + CSS)          | ≤ 1536 KiB    | Enforced by `just bundle-gate`; currently ~600 KiB.                                                                           |

## Adaptive auto-compile debounce

A fixed debounce is wrong at both ends of the size range. `adaptive_debounce_ms`
adds 1 ms per 512 bytes on top of a 250 ms floor, clamped to a 1500 ms ceiling.
`ProjectController.edit` applies `max(configured, adaptive(size))`, so:

- a short note recompiles almost immediately;
- a 100-page document waits longer, coalescing a burst of keystrokes into one
  build instead of recompiling on every change.

## Lazy loading

MathLive and PDF.js are dynamically imported, so Vite splits them into their own
chunks that load only when the math editor or the preview is first used. `pdf.ts`
memoises those dynamic imports with `startup.ts::once`, so the engine and its
worker resolve once per session rather than on every page render. `deferIdle`
pushes non-critical work past first paint.

## The bundle-size gate

`just bundle-gate` (also part of `just ci`) builds the frontend, sums the gzipped
size of every `.js` and `.css` asset, and fails if the total exceeds the budget.
The comparison logic (`evaluateBundle`) is unit-tested; the script is a thin I/O
seam.

```sh
just build        # produce apps/desktop/dist
just bundle-gate  # measure and enforce
```

## Measuring the runtime budgets

The cold-start, RAM, and recompile budgets are measured by hand on the reference
machine (there is no automated profiler in the local gate yet). Capture the
numbers into a `Measurement` and classify them with `PerfBudget::REFERENCE.evaluate`
— the report flags any metric over budget. These numbers are recorded here when
measured on real hardware; they are never fabricated.
