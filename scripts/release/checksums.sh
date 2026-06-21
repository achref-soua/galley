#!/usr/bin/env bash
# Generate SHA-256 checksums for the built native installers (master plan §4.8).
# Run after `just package`. Writes SHA256SUMS.txt (one `<sha256>  <name>` line
# per artifact) so downloads can be verified with `sha256sum -c`.
set -euo pipefail

BUNDLE_DIR="${1:-apps/desktop/src-tauri/target/release/bundle}"
OUT="${2:-SHA256SUMS.txt}"

if [ ! -d "$BUNDLE_DIR" ]; then
  echo "no bundle directory at $BUNDLE_DIR — run 'just package' first" >&2
  exit 1
fi

: >"$OUT"
found=0
while IFS= read -r -d '' file; do
  sum=$(sha256sum "$file" | cut -d' ' -f1)
  printf '%s  %s\n' "$sum" "$(basename "$file")" >>"$OUT"
  found=$((found + 1))
done < <(find "$BUNDLE_DIR" -type f \
  \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \
  -o -name '*.msi' -o -name '*.exe' -o -name '*.dmg' -o -name '*.app.tar.gz' \) -print0)

echo "› wrote ${found} checksum(s) to ${OUT}"
cat "$OUT"
