#!/usr/bin/env bash
# Lint Rust and web sources. The desktop shell (which links WebKit/GTK) is
# linted in `just package`, where the system deps are present.
set -euo pipefail

echo "› clippy (workspace, deny warnings)"
cargo clippy --workspace --all-targets -- -D warnings

echo "› eslint"
pnpm exec eslint .
