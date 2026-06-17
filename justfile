# Galley task runner. CI is manual for now (GitHub Actions is dormant), so these
# recipes ARE the quality gate — run `just ci` before every PR and release.
set shell := ["bash", "-uc"]

# Show the available recipes.
default:
    @just --list

# Full local quality gate: format → lint → coverage → audit → docs → build.
ci: format lint cover audit docs-gate build

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

# Sign & notarize artifacts — wired but a no-op until signing certs exist.
sign:
    @echo "Signing is wired but disabled until certs are configured (see SECURITY.md)."
