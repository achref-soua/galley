#!/usr/bin/env bash
# Build every core crate and the frontend bundle. Native GUI packaging lives in
# `just package`, which needs the Tauri system libraries.
set -euo pipefail

echo "› cargo build (workspace)"
cargo build --workspace

echo "› frontend build"
pnpm --filter @galley/desktop build
