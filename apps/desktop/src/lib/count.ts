/**
 * Word and character counts for LaTeX source.
 *
 * All functions are pure and have no external dependencies, so they are
 * trivially covered. The {@link countWords} function strips LaTeX markup
 * before counting so the numbers reflect actual prose, not code.
 */

/** The result of a word/character count on a LaTeX source string. */
export interface WordCount {
  /** Number of words (whitespace-delimited, LaTeX markup removed). */
  words: number;
  /** Total characters in the visible text (excluding markup). */
  chars: number;
  /** Characters excluding spaces (useful for journal "no-spaces" limits). */
  charsNoSpaces: number;
}

/**
 * Strip the parts of a LaTeX source string that are not prose:
 * - Line comments (`% …` to end of line)
 * - Display math (`$$…$$` or `\[…\]`)
 * - Inline math (`$…$` or `\(…\)`)
 * - LaTeX commands (`\commandname` and their `{…}` arguments — simplified)
 * - Remaining braces and brackets
 *
 * The stripping is deliberately conservative: it may leave some markup
 * fragments, but it avoids destroying surrounding prose.
 */
export function stripLatex(source: string): string {
  let s = source;
  // Remove % comments (everything from % to end of line, except \%).
  s = s.replace(/(?<!\\)%[^\n]*/g, '');
  // Remove display math: $$…$$ and \[…\]
  s = s.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  s = s.replace(/\\\[[\s\S]*?\\\]/g, ' ');
  // Remove inline math: $…$ and \(…\)
  s = s.replace(/(?<!\$)\$(?!\$)[\s\S]*?(?<!\$)\$(?!\$)/g, ' ');
  s = s.replace(/\\\([\s\S]*?\\\)/g, ' ');
  // Remove LaTeX commands followed by their braced arguments.
  // First remove commands like \textbf{…} — keep the argument content
  // (replace just the command token, not the braces or content).
  s = s.replace(/\\[a-zA-Z]+\*?\s*/g, ' ');
  // Remove leftover braces and brackets.
  s = s.replace(/[{}[\]]/g, ' ');
  return s;
}

/**
 * Count words and characters in a LaTeX source string, skipping markup.
 *
 * @param source The raw `.tex` source text.
 */
export function countWords(source: string): WordCount {
  if (source.length === 0) {
    return { words: 0, chars: 0, charsNoSpaces: 0 };
  }
  const text = stripLatex(source);
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;
  return { words: tokens.length, chars, charsNoSpaces };
}

/** Format a {@link WordCount} as a compact status-bar string. */
export function formatCount(count: WordCount): string {
  return `${count.words} words · ${count.chars} chars`;
}
