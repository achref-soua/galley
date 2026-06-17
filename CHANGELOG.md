# Changelog

All notable changes to Galley are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.0.3]: https://github.com/achref-soua/galley/releases/tag/v0.0.3
[0.0.2]: https://github.com/achref-soua/galley/releases/tag/v0.0.2
[0.0.1]: https://github.com/achref-soua/galley/releases/tag/v0.0.1
