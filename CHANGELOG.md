# Changelog

All notable changes to Galley are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.0.1]: https://github.com/achref-soua/galley/releases/tag/v0.0.1
