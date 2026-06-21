#!/usr/bin/env bash
# Record the demo walkthrough → docs/assets/galley-demo.webm, and (when a system
# ffmpeg is available) also render galley-demo.mp4 and galley-demo.gif.
#
# Note: Playwright bundles a record-only ffmpeg that cannot transcode, so the
# MP4/GIF step needs a real ffmpeg on PATH (e.g. `apt install ffmpeg`). Without
# one, the .webm is still produced and is embeddable on its own.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/docs/assets"
mkdir -p "$OUT"

echo "› recording the demo walkthrough"
(cd "$ROOT/apps/desktop" && pnpm exec playwright test --config playwright.screenshots.config.ts demo.spec.ts)

webm="$(find "$ROOT/apps/desktop/test-results" -name '*.webm' -print0 | xargs -0 ls -t 2>/dev/null | head -1)"
if [ -z "${webm:-}" ]; then
  echo "no recording produced" >&2
  exit 1
fi
cp "$webm" "$OUT/galley-demo.webm"
echo "› saved $OUT/galley-demo.webm"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "› ffmpeg not on PATH — keeping the .webm only (install ffmpeg for .mp4/.gif)"
  exit 0
fi

echo "› rendering MP4"
ffmpeg -y -i "$OUT/galley-demo.webm" -movflags +faststart -pix_fmt yuv420p \
  -vf "scale=1280:-2" "$OUT/galley-demo.mp4"

echo "› rendering GIF"
pal="$(mktemp --suffix=.png)"
ffmpeg -y -i "$OUT/galley-demo.webm" -vf "fps=12,scale=960:-1:flags=lanczos,palettegen" "$pal"
ffmpeg -y -i "$OUT/galley-demo.webm" -i "$pal" \
  -lavfi "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse" "$OUT/galley-demo.gif"
rm -f "$pal"

echo "› done:"
ls -la "$OUT"/galley-demo.* 2>/dev/null
