# ADR-0001: Technology stack

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

Galley is a local-first, cross-platform LaTeX studio that must start fast, stay light on
modest hardware, package into native installers for Windows/macOS/Linux, and remain easy to
test to a 100% coverage bar. The editor, compiler, language server, and version control all
have mature Rust implementations.

## Decision

- **Rust core in a [Tauri 2](https://tauri.app) shell.** A native WebView plus a Rust
  backend yields small installers and low idle memory versus Electron, with first-class
  cross-OS packaging and an updater. The heavy lifting (compile, intelligence, VCS, import,
  AI) lives in Rust crates behind a hexagonal ports-and-adapters boundary.
- **Svelte 5 + TypeScript + Vite** for the UI: tiny bundles and compile-time reactivity that
  perform well on slow machines. [CodeMirror 6](https://codemirror.net) will host both the
  code editor and the decoration-based visual editor.
- **Embedded [Tectonic](https://tectonic-typesetting.github.io)** as the default compile
  engine (kept warm, in-memory VFS) with an opt-in `latexmk`/TeX Live fallback;
  **[TexLab](https://github.com/latex-lsp/texlab)** for language intelligence; **PDF.js**
  for preview; **MathLive** for math input; **git2** for version control.
- **Provider-agnostic AI**: a thin `LlmProvider` port with adapters for cloud and local
  (OpenAI-compatible) providers, and an MCP tool host. No provider is branded or default.
- **Tooling:** [`just`](https://github.com/casey/just) as the task runner and manual CI;
  `cargo llvm-cov` and `vitest` for coverage.

## Consequences

- A polyglot-free, mostly-Rust core keeps the toolchain coherent and the binaries fast.
- The desktop shell (`apps/desktop/src-tauri`) links GTK/WebKit on Linux. To keep the core
  crates testable without those system libraries, the shell is its **own** Cargo workspace,
  separate from the root `crates/*` workspace (see ADR-0002).
- Tectonic cannot serve every package/engine; the documented `latexmk` fallback covers the
  gaps, auto-suggested by the importer when needed.
