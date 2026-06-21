# Galley task runner. CI is manual for now (GitHub Actions is dormant), so these
# recipes ARE the quality gate — run `just ci` before every PR and release.
set shell := ["bash", "-uc"]

# Show the available recipes.
default:
    @just --list

# Full local quality gate: format → lint → coverage → audit → docs → build → bundle budget.
ci: format lint cover audit docs-gate build bundle-gate

# Formatting and type checks (no writes).
format:
    bash scripts/ci/format.sh

# Auto-format Rust and web sources in place.
fmt:
    cargo fmt --all
    cd apps/desktop/src-tauri && cargo fmt
    pnpm exec prettier --write .

# Lint: clippy (deny warnings) + eslint.
lint:
    bash scripts/ci/lint.sh

# Run all tests (without the coverage gate).
test:
    cargo test --workspace
    pnpm --filter @galley/ui-kit test
    pnpm --filter @galley/desktop test

# Coverage gate — fails below 100%.
cover:
    bash scripts/ci/cover.sh

# Dependency vulnerability audit.
audit:
    bash scripts/ci/audit.sh

# Docs / changelog gate.
docs-gate:
    bash scripts/ci/docs-gate.sh

# Build every crate and the frontend bundle (no native packaging).
build:
    bash scripts/ci/build.sh

# UI bundle-size budget — fails if gzipped JS+CSS exceeds the §8.2 budget.
bundle-gate:
    bash scripts/ci/bundle-gate.sh

# Regenerate the app icon set from the 1024² brand master.
icons:
    cargo tauri icon assets/brand/icon-master.svg -o apps/desktop/src-tauri/icons
    rm -rf apps/desktop/src-tauri/icons/android apps/desktop/src-tauri/icons/ios

# Build the native installer for the current OS (needs the Tauri system deps).
package:
    cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings
    cd apps/desktop && cargo tauri build

# End-to-end smoke tests (needs a Playwright browser).
e2e:
    pnpm --filter @galley/desktop test:e2e

# Pre-warm the Tectonic package cache so the first real compile needs no network.
# Run once on a machine with connectivity; afterwards compiles work fully offline.
prewarm:
    cargo test -p galley-compile --features real-compiler --test real_compile -- --ignored

# Run the real embedded-Tectonic integration tests (needs the feature + a warm
# cache from `just prewarm`). These are excluded from `just ci` by design.
compile-itest:
    cargo test -p galley-compile --features real-compiler --test real_compile -- --ignored

# Run the live TexLab language-server integration tests (needs the `real-lsp`
# feature + a `texlab` on PATH: `cargo install --locked texlab`). Excluded from
# `just ci` by design — the protocol/mapping are covered by the pure unit tests.
lsp-itest:
    cargo test -p galley-intel --features real-lsp --test real_lsp -- --ignored --test-threads=1

# Sign & notarize artifacts — wired but a no-op until signing certs exist.
sign:
    @echo "Signing is wired but disabled until certs are configured (see SECURITY.md)."
