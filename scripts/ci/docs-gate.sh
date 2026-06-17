#!/usr/bin/env bash
# Docs gate: the founding docs exist and the changelog mentions this version.
set -euo pipefail

version="$(grep -m1 '^version' Cargo.toml | sed -E 's/.*"([^"]+)".*/\1/')"
echo "› docs gate for v${version}"

for f in README.md CHANGELOG.md SECURITY.md CONTRIBUTING.md LICENSE; do
  test -f "$f" || {
    echo "  missing required doc: $f" >&2
    exit 1
  }
done

grep -q "${version}" CHANGELOG.md || {
  echo "  CHANGELOG.md has no entry for ${version}" >&2
  exit 1
}

echo "  OK"
