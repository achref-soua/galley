# Changelog

All notable changes to Galley are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-18

Language intelligence — the editor now understands LaTeX, powered by the TexLab language server.

### Added

- A **`LanguageIntelligence` port** in `galley-core` with pure domain types (completion, hover,
  definition, document symbols), and a **`galley-intel`** crate that implements it over LSP:
  `Content-Length` framing, JSON-RPC, and result mapping — all pure and fully tested against
  fixtures captured from a live TexLab.
- **Completion** as you type — commands, environments, packages, document classes, `\ref` labels,
  `\cite` keys, and file paths — with kind-aware icons and the right insertion text.
- **Hovers** with signature/help for the symbol under the cursor.
- **Go-to-definition** (`F12`) that resolves a `\ref`/`\cite` to its `\label`/bibliography entry,
  **across files** in a multi-file project, opening the target file when needed.
- A **document outline** panel listing the structural symbols (sections, environments), with
  click-to-jump.
- **Live diagnostics** from the language server (ChkTeX style notes and TexLab's own analysis),
  **merged** with the compile log's diagnostics into the same gutter and problems panel.

### Notes

- The live `texlab` process sits behind a `real-lsp` Cargo feature (off in the build and coverage
  gates, mirroring `real-compiler`) and is exercised by `#[ignore]`d integration tests
  (`just lsp-itest`). `texlab` is a host requirement for the packaged app and the itests; the
  editor degrades gracefully to no language features when it is absent.
- The compile build root remains single-file; the language server indexes the whole project, so
  completion and navigation already work across files. Multi-file **compile** root awareness and
  the richer structure sidebar are `v0.2.1`. See ADR-0009.

## [0.1.2] - 2026-06-18

Errors, warnings, and friendly tips — never just a raw log.

### Added

- A **TeX-log parser** in `galley-core` (`diagnostics`) that turns the raw compile log into
  structured **diagnostics** — errors, warnings, and bad boxes — each with a cleaned message, a
  severity, a source line where the log gives one, and a **plain-language explanation and fix
  tip** in Galley's voice. It recognises the common offenders: undefined control sequences,
  `Missing $`, runaway arguments (an unclosed brace), mismatched environments, missing files,
  package errors, undefined references and citations, and overfull/underfull boxes.
- **Inline gutter markers** in the editor — a dot beside each line that has a problem, coloured
  by the worst severity on that line.
- A **problems panel** beneath the editor that lists the diagnostics worst-first by line, with a
  one-line explanation and the raw message, and a **jump-to-source** click that moves the cursor
  to the offending line.
- ADR-0008 (compile diagnostics).

### Changed

- The compile result now carries its parsed `diagnostics` alongside the log, so the editor and
  the problems panel show the structured view while the raw log stays available in the preview.

## [0.1.1] - 2026-06-17

Fast, incremental compilation — recompiles that feel instant.

### Added

- An **incremental compile cache**: a dependency-free FNV-1a `content_hash` in `galley-core`
  and a `CachingCompiler` in `galley-compile` that serves the previous proof when the source
  is unchanged, so a no-change recompile never touches the engine.
- A **warm engine**: the desktop shell keeps one long-lived compiler in memory (rather than
  building one per compile), reusing Tectonic's on-disk format and bundle caches so only the
  first build pays the cold-start cost.
- **Compile as you type**: a debounced, cancellable auto-compile that coalesces a burst of
  keystrokes into one build and drops a stale build so it can never overwrite a newer proof.
  Toggleable under Settings → Compilation (on by default).
- **Build status and timing** in the preview bar, including a `cached` indicator when the
  proof came straight from the cache.
- An optional success **bell** — a short Web Audio "ding" on a successful build, **off by
  default**, under Settings → Compilation.
- ADR-0007 (fast, incremental compilation).

### Changed

- The preview now **keeps the last good proof on screen** while a new build runs and when a
  rebuild fails (showing the error alongside it), so it never flickers to empty.
- **Compiling no longer saves the document.** Galley compiles the editor's canonical buffer
  directly; saving stays the explicit `Ctrl`/`⌘`+`S` action (and the unsaved-changes guard),
  which keeps dirty-tracking meaningful and lets auto-compile preview unsaved work.

## [0.1.0] - 2026-06-17

Editing and compile — a real editor, an embedded TeX engine, and a live proof.

### Added

- A real **CodeMirror 6** LaTeX editor over the canonical `.tex` source, with syntax
  highlighting, environment folding, bracket matching, and history, themed for both
  Onionskin and Carbon through the design tokens. It replaces the placeholder editing
  surface.
- **Embedded Tectonic** compilation behind the `Compiler` port: the pure build planning and
  result shaping live in covered crates (`galley-core`, `galley-compile`), and the native
  engine sits behind a mockable `LatexEngine` seam, compiled only under the `real-compiler`
  feature (see ADR-0006).
- A **PDF.js** preview that renders the compiled proof onto a canvas and reports the page
  count, replacing the placeholder. The renderer is injectable and PDF.js is lazily loaded.
- A manual **Compile** action — a titlebar button and the `Ctrl`/`⌘`+`B` shortcut — that
  saves the source and compiles it, surfacing the proof or the failure log in the preview.
- Offline compilation: `just prewarm` warms the Tectonic package cache once so subsequent
  compiles need no network; an offline integration test verifies a stock `article` builds
  with connectivity disabled.
- ADR-0006 (embedded Tectonic compilation and the PDF.js preview).

## [0.0.3] - 2026-06-17

The project model and the file tree — create, open, edit, and save real projects.

### Added

- The pure project domain in `galley-core`: `Project`, `Document`/`DocumentKind`, the
  non-intrusive `.galley/project.toml` `Manifest` (a dependency-free format that never
  affects compilation and is safe to delete), root-document detection, and a small
  dependency-free ISO-8601 timestamp formatter.
- A sandboxed `FileStore` (`SafeRoot` in `galley-security`) that confines every read,
  write, and listing to the project root, refusing absolute paths, `..` traversal, and
  symlinks that escape.
- Project creation and a minimal folder importer (`galley-import`): create a project with a
  starter `main.tex`, or open an existing on-disk LaTeX folder — scanning its files,
  detecting the root document, and recreating the manifest when `.galley/` is missing.
- A thin Tauri command layer (`create_project`, `open_folder`, `read_document`,
  `save_document`) plus native folder-picker dialogs.
- A file-explorer sidebar replacing the placeholder, a plain editing surface with
  open/save and dirty tracking, an unsaved-changes guard when switching files, and a
  recent-projects list.
- ADR-0005 (the project model and the sandboxed file store).

## [0.0.2] - 2026-06-17

The Galley look — both themes, the design system, and the workspace shell.

### Added

- The full design-token system in `@galley/ui-kit`: the typewriter palette plus
  type, spacing, radius, and motion scales (`tokens.css`), a semantic theme layer
  (`themes.css`), and the editor syntax theme (`syntax.css`), bundled as
  `@galley/ui-kit/styles.css`.
- The **Onionskin** (light) and **Carbon** (dark) themes, applied across the whole
  app, the editor syntax sample, and the PDF-viewer chrome.
- A theme switcher that follows the OS on first run, persists the user's choice,
  and repaints the entire app instantly; reduced motion is honoured throughout.
- Shared UI-kit primitives — Logo, Wordmark, Button, IconButton, Toggle,
  SegmentedControl, Panel, Icon — with Storybook stories.
- A resizable, collapsible three-pane workspace (sidebar · editor · preview) whose
  pane sizes and collapse state are remembered, plus an in-app titlebar and a
  settings shell.
- A contrast baseline that checks the shipped palette against WCAG ratios in both
  themes.
- ADR-0003 (design tokens and theming) and ADR-0004 (the UI kit as a tested
  component library).

## [0.0.1] - 2026-06-17

The first scaffold — a real, buildable, fully-gated foundation.

### Added

- pnpm and Cargo workspaces: the pure `galley-core` domain crate plus placeholder adapter
  crates for compile, language intelligence, version control, import, AI, and security.
- A Tauri 2 + Svelte 5 desktop shell with a themed "hello" window that already wears the
  double-strike **G** icon.
- The brand foundation: the 1024² icon master, the generated cross-platform icon set, the
  design tokens, and the Onionskin palette.
- A manual quality gate (`just ci`) enforcing formatting, linting, a **100% coverage**
  threshold, a dependency audit, a docs gate, and the build.
- A dormant GitHub Actions workflow that mirrors the local gate, ready to enable.
- Founding documents: README, LICENSE (MIT), SECURITY, CONTRIBUTING, and ADR-0001
  (technology stack) and ADR-0002 (coverage policy and the bootstrap exclusion).

[0.1.0]: https://github.com/achref-soua/galley/releases/tag/v0.1.0
[0.0.3]: https://github.com/achref-soua/galley/releases/tag/v0.0.3
[0.0.2]: https://github.com/achref-soua/galley/releases/tag/v0.0.2
[0.0.1]: https://github.com/achref-soua/galley/releases/tag/v0.0.1
