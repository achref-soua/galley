/**
 * Pure helpers for asset management — snippet generation, preamble detection,
 * and file-type classification. All functions are I/O-free and fully testable.
 */

/** Extensions that can be previewed as images. */
const IMAGE_EXTS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'svg',
  'tif',
  'tiff'
]);

/**
 * Return `true` when `filename` has an image extension that can be previewed
 * inline. Case-insensitive.
 */
export function isImageExt(filename: string): boolean {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) {
    return false;
  }
  return IMAGE_EXTS.has(filename.slice(dot + 1).toLowerCase());
}

/**
 * Generate the LaTeX `\includegraphics` snippet for inserting `relPath` at
 * the cursor.
 *
 * @example
 *   assetSnippet('assets/fig.png')
 *   // → '\\includegraphics[width=\\linewidth]{assets/fig.png}'
 */
export function assetSnippet(relPath: string): string {
  return `\\includegraphics[width=\\linewidth]{${relPath}}`;
}

/**
 * Return `true` when `source` contains `\includegraphics` but not
 * `\graphicspath` — the cue to offer adding `\graphicspath{{assets/}}`.
 */
export function needsGraphicspath(source: string): boolean {
  return source.includes('\\includegraphics') && !source.includes('\\graphicspath');
}

/**
 * Insert `\graphicspath{{assets/}}` into `source` before `\begin{document}`.
 * When `\begin{document}` is absent the directive is appended at the end.
 *
 * Assumes `source` does not already contain `\graphicspath`.
 */
export function insertGraphicspath(source: string): string {
  const marker = '\\begin{document}';
  const idx = source.indexOf(marker);
  if (idx < 0) {
    return source + '\n\\graphicspath{{assets/}}\n';
  }
  return source.slice(0, idx) + '\\graphicspath{{assets/}}\n' + source.slice(idx);
}
