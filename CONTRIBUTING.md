# Contributing to Galley

Thanks for your interest in Galley. This guide covers the setup and the standards every
change is held to.

## Development setup

You'll need Rust ≥ 1.96, Node.js ≥ 20.9, [pnpm](https://pnpm.io), and
[just](https://github.com/casey/just). On Linux, install the Tauri system libraries (see the
[README](README.md#quickstart)).

```bash
pnpm install
cargo install tauri-cli --version "^2" --locked
just ci          # run the full quality gate
pnpm dev         # run the app in development
```

## The quality gate

CI is **manual** for now — GitHub Actions is present but dormant. Run `just ci` before you
open a PR and before it merges, and note in the PR that it passed. The gate runs, in order:
formatting, linting, the coverage gate, a dependency audit, a docs check, and the build.

**100% coverage is required to merge.** Both the Rust (`cargo llvm-cov`) and the frontend
(`vitest`) suites must be fully green at 100% — no exceptions beyond the documented
bootstrap exclusion (see [ADR-0002](docs/adr/0002-coverage-and-bootstrap-exclusion.md)).
New code ships with its tests.

## Branching & commits

- `main` and `develop` are protected; never push to them directly.
- Branch off `develop`: `feat/…`, `fix/…`, `docs/…`, `chore/…`, `refactor/…`.
- Open a PR into `develop`; once the gate is green it is squash-merged and the branch is
  deleted. Releases are cut from `develop` into `main` and tagged.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and
  describe the change.

## Code style

- Rust: `cargo fmt` + clippy with warnings denied.
- TypeScript/Svelte: `prettier` + `eslint` + `svelte-check`.
- Keep domain logic in the pure crates; framework code stays at the edges.
