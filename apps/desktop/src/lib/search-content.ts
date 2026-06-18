/**
 * Client-side content search matching the behaviour of the Rust
 * `galley_core::search` module. Used by the in-memory browser backend
 * and directly in the search panel for replace previews.
 *
 * All functions are pure and have no external dependencies.
 */

/** Parameters for a search operation. */
export interface SearchQuery {
  /** The pattern text (literal or regex). */
  pattern: string;
  /** Match case when true (default false). */
  caseSensitive: boolean;
  /** Only match whole words. */
  wholeWord: boolean;
  /** Treat `pattern` as a regular expression. */
  useRegex: boolean;
}

/** A single match within a file. */
export interface SearchMatch {
  /** 1-based line number. */
  line: number;
  /** 1-based column. */
  column: number;
  /** The full source line containing the match. */
  lineText: string;
  /** Byte offset where the match starts. */
  matchStart: number;
  /** Byte offset where the match ends (exclusive). */
  matchEnd: number;
}

/** All matches found in one file. */
export interface FileMatches {
  /** Project-relative file path. */
  file: string;
  /** The matches within that file. */
  matches: SearchMatch[];
}

/**
 * Build a `RegExp` from `query`, returning `null` for an invalid or empty
 * pattern.
 */
export function buildRegex(query: SearchQuery): RegExp | null {
  if (query.pattern.length === 0) {
    return null;
  }
  let pat = query.useRegex ? query.pattern : escapeRegex(query.pattern);
  if (query.wholeWord) {
    pat = `\\b${pat}\\b`;
  }
  const flags = query.caseSensitive ? 'gd' : 'gdi';
  try {
    return new RegExp(pat, flags);
  } catch {
    return null;
  }
}

/** Escape a literal string for use in a `RegExp`. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Search `content` for all occurrences of `query`.
 * Returns an empty array when the pattern is empty or invalid.
 */
export function searchInContent(content: string, query: SearchQuery): SearchMatch[] {
  const re = buildRegex(query);
  if (re === null) {
    return [];
  }
  // Precompute line start offsets.
  const lineStarts: number[] = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }

  const results: SearchMatch[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(content)) !== null) {
    const start = m.index;
    // Binary search for the line containing `start`.
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= start) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const lineIdx = lo;
    const lineStart = lineStarts[lineIdx];
    const lineEnd = lineIdx + 1 < lineStarts.length ? lineStarts[lineIdx + 1] - 1 : content.length;
    const lineText = content.slice(lineStart, lineEnd).replace(/\r$/, '');
    results.push({
      line: lineIdx + 1,
      column: start - lineStart + 1,
      lineText,
      matchStart: start,
      matchEnd: start + m[0].length
    });
    // Avoid infinite loop on zero-length matches.
    if (m[0].length === 0) {
      re.lastIndex += 1;
    }
  }
  return results;
}

/**
 * Apply a replacement to `content`, replacing all occurrences of `query`
 * with `replacement`. Regex back-references (`$1`, `$&`, etc.) work when
 * `query.useRegex` is true. Returns the original content on an invalid
 * query.
 */
export function replaceInContent(content: string, query: SearchQuery, replacement: string): string {
  const re = buildRegex(query);
  if (re === null) {
    return content;
  }
  return content.replace(re, replacement);
}
