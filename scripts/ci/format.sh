#!/usr/bin/env bash
# Formatting and type checks — no files are modified.
set -euo pipefail

echo "› cargo fmt (workspace)"
cargo fmt --all --check

echo "› cargo fmt (desktop shell)"
(cd apps/desktop/src-tauri && cargo fmt --check)

echo "› prettier"
pnpm exec prettier --check .

echo "› svelte-check"
pnpm --filter @galley/desktop check
