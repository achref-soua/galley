# ADR-0006: Embedded Tectonic compilation and the PDF.js preview

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

`v0.1.0` turns Galley from a file browser into an editor: a real CodeMirror 6 editor over
the canonical `.tex` source, embedded Tectonic compilation, and a PDF.js preview. Two of
these — Tectonic and PDF.js — are heavy, environment-specific dependencies that cannot run
in the headless coverage environment (Tectonic links vendored C/C++ and needs a package
bundle; PDF.js needs a real canvas and worker, and its browser build references globals
that do not exist under jsdom). The 100%-coverage gate (ADR-0002) still applies, so the
challenge is to keep the _decisions_ in covered code and isolate the _native/browser calls_
behind seams that tests can stand in for.

## Decision

**The `Compiler` port lives in `galley-core`; the engine call sits behind a second seam.**

- `galley-core::compile` holds the pure domain: `Engine`, `CompileRequest`, `BuildPlan`
  (request validation + job-name derivation), `CompileReport`/`CompileResult`, and the
  `Compiler` port. It is unit-tested to 100% with no TeX engine present.
- `galley-compile` implements the port as `EmbeddedCompiler<E: LatexEngine>`. The
  orchestration — validate the request, run the engine, shape the result — is generic over
  the narrow `LatexEngine` seam and is covered to 100% with a single mock engine. (A single
  configurable mock, rather than separate success/failure engines, keeps the generic to one
  monomorphization so every match arm is exercised.)
- The real engine, `TectonicEngine`, is compiled only under the **`real-compiler`** Cargo
  feature, which the desktop shell turns on but `just ci` (coverage and build) does not. So
  Tectonic — and its ~460-crate dependency tree — never enters the core workspace's test,
  clippy, or coverage runs; it is built only by `just package`. The engine is exercised by
  the `#[ignore]`d integration tests in `crates/galley-compile/tests/`, run by hand like the
  filesystem tests (`just compile-itest`).

**The Tauri command layer stays thin (per ADR-0002).** `compile_document` converts its
arguments, runs `EmbeddedCompiler::new(TectonicEngine::new())`, and serializes the result.
The PDF bytes cross the IPC boundary as a byte array and are rebuilt into a `Uint8Array` in
the frontend backend adapter.

**Offline by a pre-warmed cache.** The acceptance criterion is that a stock `article`
compiles _offline_. Tectonic fetches its package bundle from the network on a cold cache and
caches every file it uses. `just prewarm` performs one online compile to populate that
cache; afterwards `TectonicEngine::offline()` (cache-only, no network) compiles the same
document with no connectivity — verified by the `compiles_offline_after_prewarm` integration
test. The shipped app uses `TectonicEngine::new()` (cache-first, fetch-on-miss) so it works
both online and, once warmed, offline. Bundling a cache into the installer for a truly
zero-network first run is a packaging concern deferred to v0.7.3.

**PDF.js is injected and lazily imported.** The preview renders through a `PdfRenderer`
seam; the component and preview state are covered with a fake renderer, and the real
`pdfjsRenderer` is covered with `pdfjs-dist` mocked. PDF.js is loaded with a dynamic
`import()` _inside_ `render`, so (a) it stays out of the startup bundle until a proof is
first shown, and (b) importing the module never pulls PDF.js into jsdom, where its
browser-only globals are absent.

**The CodeMirror editor is injected too.** `EditorPane` builds its editor through an
`EditorFactory`; the real CodeMirror factory and the pure fold logic are covered directly
(CodeMirror's headless `EditorState`/`EditorView` run under jsdom), while the App-level
integration tests drive a textarea-backed fake so the project/guard flow stays
deterministic. The real editor and preview are exercised end-to-end by the Playwright e2e.

## Consequences

- The compile decisions and result-shaping are fully covered; the only code outside the
  gate is the genuinely un-headless-testable native engine, gated behind a feature and
  proven by manual integration tests — consistent with the ADR-0002 bootstrap exclusion.
- `cargo test`/`clippy`/`llvm-cov` over the core workspace remain fast and free of system
  TeX libraries; only `just package` and `just prewarm`/`just compile-itest` build Tectonic.
- Lazy-loading PDF.js keeps cold start light and sidesteps the jsdom/browser-globals
  mismatch without polyfills.
- True zero-network-on-first-run requires shipping a bundle with the installer; until then,
  offline compiling depends on a one-time `just prewarm`.
