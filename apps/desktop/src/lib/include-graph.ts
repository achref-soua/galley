/**
 * Pure helpers for parsing LaTeX include directives from source text.
 *
 * These mirror the Rust `galley_core::include_graph` module and are used
 * client-side to display the current document's include tree in the structure
 * panel without a round-trip to the Rust layer.
 */

const CMDS = ['\\input{', '\\include{', '\\subfile{'] as const;

/** Strip the comment portion of a LaTeX source line (from the first `%` onward). */
function stripComment(line: string): string {
  const i = line.indexOf('%');
  return i === -1 ? line : line.slice(0, i);
}

/**
 * Parse `\input{…}`, `\include{…}`, and `\subfile{…}` directives from the
 * given LaTeX source, returning each referenced path in document order.
 * The path is returned exactly as written (no extension normalization).
 */
export function parseIncludes(source: string): string[] {
  const result: string[] = [];
  for (const raw of source.split('\n')) {
    const line = stripComment(raw);
    for (const cmd of CMDS) {
      let rest = line;
      let start: number;
      while ((start = rest.indexOf(cmd)) !== -1) {
        const after = rest.slice(start + cmd.length);
        const close = after.indexOf('}');
        if (close === -1) break;
        const path = after.slice(0, close).trim();
        if (path.length > 0) result.push(path);
        rest = rest.slice(start + cmd.length + close + 1);
      }
    }
  }
  return result;
}

/**
 * Normalize an include path: when the last path component has no extension,
 * append `.tex` — matching LaTeX's own file-resolution rule.
 */
export function resolveIncludePath(raw: string): string {
  if (raw.length === 0) return '';
  const lastSlash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
  const filename = lastSlash === -1 ? raw : raw.slice(lastSlash + 1);
  return filename.includes('.') ? raw : `${raw}.tex`;
}
