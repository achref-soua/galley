#!/usr/bin/env bash
# Dependency vulnerability audit.
set -euo pipefail

echo "› cargo audit"
if command -v cargo-audit >/dev/null 2>&1 || cargo audit --version >/dev/null 2>&1; then
  cargo audit
else
  echo "  cargo-audit is not installed. Install it with: cargo install cargo-audit" >&2
  exit 1
fi

echo "› pnpm audit (production dependencies, high severity)"
pnpm audit --prod --audit-level high
