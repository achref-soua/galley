<div align="center">
  <img src="assets/brand/galley-logo.svg" alt="Galley" width="440" />

  <p><strong>A local-first, blazing-fast LaTeX studio. Pull a proof.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/license-MIT-A8362B" alt="License: MIT" />
    <img src="https://img.shields.io/badge/coverage-100%25-1C1A17" alt="Coverage: 100%" />
    <img src="https://img.shields.io/badge/CI-manual%20(just%20ci)-4A443B" alt="CI: manual" />
    <img src="https://img.shields.io/badge/status-early%20development-9A8E7E" alt="Status: early development" />
  </p>
</div>

---

Galley is what a great LaTeX editor should feel like: **local, instant, private, and
beautiful**. A power-user code editor and a Word-like visual editor are two views of the
_same_ `.tex` source. Live preview. A provider-agnostic AI collaborator you fully control.
And a one-click path to bring your existing projects in. It produces **every** kind of
LaTeX document — papers, theses, books, CVs, slides, posters, letters, and more.

The interface borrows from a fine mechanical typewriter: a two-tone black-and-red ribbon,
a monospace impression struck into warm paper, restrained and tactile.

> **Status — early development.** This is `v0.1.2`: errors, warnings, and friendly tips. On top
> of the warm, incremental CodeMirror 6 + **Tectonic** + **PDF.js** core, a failed build is no
> longer a raw log — Galley parses it into structured diagnostics, marks the offending lines in
> the gutter, and lists them in a problems panel with plain-language explanations and a click
> that jumps to the source. The visual editor and the AI layer arrive in subsequent versioned
> releases.

## Editing & compiling

The editor is CodeMirror 6 over the canonical `.tex` source — there is no parallel model.
Galley compiles that buffer directly with an embedded Tectonic engine and renders the PDF in
the preview pane; a failed build shows its log instead. Compilation is **incremental and
warm**: one long-lived engine reuses Tectonic's cached format and bundle, and an in-memory
content cache returns the previous proof unchanged when nothing changed — so a cached
single-edit recompile is sub-second. It runs **as you type** (debounced, and stale builds are
dropped), or on demand with **Compile** / `Ctrl`/`⌘`+`B`; the preview keeps the last good
proof on screen rather than flickering, shows the build time, and can ring a bell on success
(off by default — Settings → Compilation). Saving stays a separate, explicit action. Tectonic
fetches its package bundle once and caches it, so after a single `just prewarm` (or first
online compile) every later compile works **fully offline**.

## Errors & guidance

When a build fails you get help, not a transcript. Galley parses the TeX log into structured
**diagnostics** — errors, warnings, and bad boxes — and surfaces them three ways: a coloured
**dot in the editor gutter** beside each affected line, a **problems panel** under the editor
that lists them worst-first, and a **click that jumps** the cursor to the offending line. Each
entry pairs the raw message with a **plain-language explanation and fix tip** in Galley's
voice — _"A brace was opened and never closed…"_ rather than _"Paragraph ended before…"_. It
knows the common offenders: undefined commands, `Missing $`, unclosed braces and environments,
missing files, package errors, undefined references and citations, and overfull/underfull
boxes. The raw log is still there in the preview when you want it.

## Projects

A project is just a folder. **New project** scaffolds one with a starter `main.tex`;
**Open a folder** imports any existing LaTeX directory in place — Galley scans it, detects
the root document, and adds a single `.galley/project.toml` manifest that never affects
compilation and can be deleted at any time. Files open and save with a dirty marker, and a
guard catches unsaved edits before you switch away. Everything stays inside the project
root: a sandboxed file store refuses absolute paths, `..` traversal, and escaping symlinks.

## Themes

Galley ships two first-class themes built from a single token system: **Onionskin**, the
freshly-typed light sheet, and **Carbon**, the dark carbon-copy. The switcher follows your
OS on first run, remembers your choice, and repaints the whole app — chrome, editor syntax
colours, and PDF-viewer chrome — instantly. Reduced-motion is honoured throughout, and the
palette is checked against WCAG contrast ratios in both themes on every build.

## Why Galley

- **Instant & local-first.** A warm, embedded compile engine and an in-memory build cache,
  built for sub-second incremental recompiles — fully offline, nothing leaves your machine.
- **Two doors, one room.** A CodeMirror code editor and a rich-text visual editor over the
  _same_ source. Switch freely, lose nothing.
- **Every document, one tool.** If LaTeX can make it, Galley edits, previews, and exports it.
- **Move in, don't rebuild.** Existing projects (Overleaf, arXiv, any folder) import cleanly
  and round-trip back out — no lock-in, either direction.
- **AI you control.** Bring your own key for any provider, cloud or local. No vendor lock-in,
  nothing branded or default-enabled, every change reversible.

## Architecture

Galley is a [Tauri 2](https://tauri.app) desktop app: a Rust core does the heavy lifting
behind a hexagonal ports-and-adapters boundary, with a Svelte 5 + TypeScript UI in the
native WebView — no bundled browser, no Node runtime in the shipped app.

```
galley/
├─ apps/desktop/        # Tauri 2 + Svelte 5 app (UI in src/, shell in src-tauri/)
├─ crates/
│  ├─ galley-core/      # pure, I/O-free domain: Project, Document, Manifest, compile, diagnostics
│  ├─ galley-compile/   # embedded Tectonic behind the Compiler port
│  ├─ galley-intel/     # TexLab (LSP) + SyncTeX             (placeholder)
│  ├─ galley-vcs/       # git2 history / snapshots / revert  (placeholder)
│  ├─ galley-import/    # create/open projects; folder importer
│  ├─ galley-ai/        # provider-agnostic AI + MCP host    (placeholder)
│  └─ galley-security/  # sandboxed file store + keychain (sandbox policy)
├─ packages/ui-kit/     # design tokens, themes, shared components
├─ assets/brand/        # the double-strike "G" icon master
├─ docs/adr/            # architecture decision records
└─ scripts/ci/          # the quality-gate steps
```

## Quickstart

**Prerequisites:** [Rust](https://rustup.rs) ≥ 1.96, [Node.js](https://nodejs.org) ≥ 20.9,
[pnpm](https://pnpm.io), [just](https://github.com/casey/just). On Linux you also need the
Tauri system libraries:

```bash
sudo apt-get update && sudo apt-get install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config
```

```bash
git clone https://github.com/achref-soua/galley.git
cd galley
pnpm install                 # install web dependencies
cargo install tauri-cli --version "^2" --locked   # one-time
pnpm dev                     # run the dev server, or:
just package                 # build the native installer for your OS
```

## Build & test reference

The quality gate is **manual** for now (GitHub Actions is present but dormant). Run it
before every change:

| Command        | What it does                                                   |
| -------------- | -------------------------------------------------------------- |
| `just ci`      | The full gate: format → lint → coverage → audit → docs → build |
| `just fmt`     | Auto-format Rust and web sources                               |
| `just test`    | Run all tests                                                  |
| `just cover`   | Coverage gate — **fails below 100%** (line/branch)             |
| `just lint`    | clippy (deny warnings) + eslint                                |
| `just build`   | Build all crates and the frontend bundle                       |
| `just icons`   | Regenerate the app icon set from the brand master              |
| `just prewarm` | Warm the Tectonic package cache so compiles work offline       |
| `just e2e`     | Playwright end-to-end smoke tests (needs a browser)            |
| `just package` | Build the native installer for the current OS                  |

The embedded Tectonic engine is built only by `just package` (and the manual
`just prewarm` / `just compile-itest`), behind the `real-compiler` feature, so the core
test and coverage runs never need the native TeX libraries. See
[ADR-0006](docs/adr/0006-embedded-compile-and-preview.md).

## Documentation

- [Architecture decisions](docs/adr/) — the choices behind the stack and the testing model.
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © Achref Soua
