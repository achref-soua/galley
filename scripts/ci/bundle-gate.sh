#!/usr/bin/env bash
# UI bundle-size budget (master plan §8.2). Sums the gzipped size of the shipped
# JavaScript and CSS in the built frontend and fails if it exceeds the budget
# that `galley-core::perf` / `perf-budget.ts` declare (PerfBudget.bundle_kib).
#
# Run after `just build` (which produces apps/desktop/dist); it rebuilds the
# frontend only if the dist directory is missing.
set -euo pipefail

DIST="apps/desktop/dist"
BUDGET_KIB=1536

if [ ! -d "$DIST" ]; then
  echo "› dist missing — building the frontend"
  pnpm --filter @galley/desktop build >/dev/null
fi

total=0
while IFS= read -r -d '' file; do
  size=$(gzip -c "$file" | wc -c)
  total=$((total + size))
done < <(find "$DIST" -type f \( -name '*.js' -o -name '*.css' \) -print0)

budget=$((BUDGET_KIB * 1024))
echo "› UI bundle (gzipped JS + CSS): ${total} B / ${budget} B budget (${BUDGET_KIB} KiB)"

if [ "$total" -gt "$budget" ]; then
  echo "✗ UI bundle exceeds budget by $((total - budget)) B"
  exit 1
fi
echo "✓ within the UI bundle budget"
