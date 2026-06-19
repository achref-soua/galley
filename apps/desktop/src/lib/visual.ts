/**
 * Pure parse helpers for the visual (WYSIWYG) decoration layer.
 *
 * Every function here is I/O-free and operates on plain strings; results are
 * plain data that the CM6 view plugin wires into decorations. Keeping the logic
 * here means 100% coverage without a DOM or an editor instance.
 */

/** Visual heading depth — 1 is the largest (part/chapter), 6 the smallest. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A parsed heading command: the full `\section{Title}` sequence with offsets
 * for both the command wrapper and the bare title text inside the braces.
 */
export interface HeadingSpec {
  level: HeadingLevel;
  title: string;
  /** Absolute offset of the leading `\`. */
  from: number;
  /** Absolute offset of the first character inside `{`. */
  titleFrom: number;
  /** Absolute offset of the closing `}`. */
  titleTo: number;
  /** Absolute offset just past the `}`. */
  to: number;
}

/** A parsed `\textbf`, `\textit`, or `\emph` command with content offsets. */
export interface MarkupSpec {
  kind: 'bold' | 'italic';
  content: string;
  from: number;
  contentFrom: number;
  contentTo: number;
  to: number;
}

/** Position of a `\item` token (just the keyword, not the rest of the line). */
export interface ItemSpec {
  from: number;
  to: number;
}

/** A `$…$` inline-math expression. */
export interface InlineMathSpec {
  content: string;
  from: number;
  to: number;
}

/** A `\url{…}` link. */
export interface LinkSpec {
  url: string;
  from: number;
  to: number;
}

/** A `\includegraphics[…]{path}` reference. */
export interface ImageSpec {
  path: string;
  from: number;
  to: number;
}

const HEADING_LEVELS: Record<string, HeadingLevel> = {
  part: 1,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6
};

const MARKUP_KINDS: Record<string, 'bold' | 'italic'> = {
  textbf: 'bold',
  textit: 'italic',
  emph: 'italic'
};

/**
 * Find all heading commands in `doc` and return their position metadata.
 * Only matches simple `\section{Title}` forms; starred variants and those with
 * nested braces are not modified (they fall through to the chip layer).
 */
export function parseHeadings(doc: string): HeadingSpec[] {
  const re = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\{([^}]*)\}/g;
  const results: HeadingSpec[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const cmd = m[1];
    const title = m[2];
    const from = m.index;
    const to = from + m[0].length;
    // '\' + cmd + '{' = 1 + cmd.length + 1 chars before the title
    const titleFrom = from + 1 + cmd.length + 1;
    const titleTo = titleFrom + title.length;
    results.push({ level: HEADING_LEVELS[cmd]!, title, from, titleFrom, titleTo, to });
  }
  return results;
}

/**
 * Find all `\textbf`, `\textit`, and `\emph` commands in `doc` (single-level
 * brace content only — no nested braces).
 */
export function parseMarkup(doc: string): MarkupSpec[] {
  const re = /\\(textbf|textit|emph)\{([^}]*)\}/g;
  const results: MarkupSpec[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const cmd = m[1];
    const content = m[2];
    const from = m.index;
    const to = from + m[0].length;
    const contentFrom = from + 1 + cmd.length + 1;
    const contentTo = contentFrom + content.length;
    results.push({ kind: MARKUP_KINDS[cmd]!, content, from, contentFrom, contentTo, to });
  }
  return results;
}

/**
 * Find all `\item` tokens in `doc`.  Matches `\item` followed by whitespace,
 * `{`, or end-of-line — avoids matching `\itemize` or similar.
 */
export function parseItems(doc: string): ItemSpec[] {
  const re = /\\item(?=[\s{]|$)/gm;
  const results: ItemSpec[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    results.push({ from: m.index, to: m.index + 5 }); // '\item' is 5 chars
  }
  return results;
}

/**
 * Find all `$…$` inline-math expressions in `doc`.  Does not match `$$…$$`
 * display math (the negative look-around handles that).
 */
export function parseInlineMath(doc: string): InlineMathSpec[] {
  const re = /(?<!\$)\$([^$\n]+)\$(?!\$)/g;
  const results: InlineMathSpec[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    results.push({ content: m[1], from: m.index, to: m.index + m[0].length });
  }
  return results;
}

/** Find all `\url{…}` commands in `doc`. */
export function parseLinks(doc: string): LinkSpec[] {
  const re = /\\url\{([^}]*)\}/g;
  const results: LinkSpec[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    results.push({ url: m[1], from: m.index, to: m.index + m[0].length });
  }
  return results;
}

/** Find all `\includegraphics[…]{path}` references in `doc`. */
export function parseImages(doc: string): ImageSpec[] {
  const re = /\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}/g;
  const results: ImageSpec[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    results.push({ path: m[1], from: m.index, to: m.index + m[0].length });
  }
  return results;
}
