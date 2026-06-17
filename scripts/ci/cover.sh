#!/usr/bin/env bash
# Coverage gate. Fails the build below 100%.
#
# Rust (stable llvm-cov) reports line/region/function coverage; branch coverage
# is not emitted on stable, so the frontend (vitest v8) carries the 100% branch
# requirement. See docs/adr/0002.
set -euo pipefail

echo "› Rust coverage (100% lines / regions / functions)"
cargo llvm-cov --workspace \
  --fail-under-lines 100 \
  --fail-under-functions 100 \
  --fail-under-regions 100

echo "› UI-kit coverage (100% lines / branches / functions / statements)"
pnpm --filter @galley/ui-kit test

echo "› Frontend coverage (100% lines / branches / functions / statements)"
pnpm --filter @galley/desktop test
