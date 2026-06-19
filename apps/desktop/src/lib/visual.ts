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

// ---------------------------------------------------------------------------
// Visual editing helpers — precise source patches for WYSIWYG operations
// ---------------------------------------------------------------------------

/**
 * Canonical order of LaTeX heading commands from largest (part) to smallest
 * (subparagraph). Used for promote/demote operations.
 */
export const HEADING_ORDER = [
  'part',
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph'
] as const;

/** A LaTeX heading command name. */
export type HeadingCmd = (typeof HEADING_ORDER)[number];

/**
 * Detect the heading command at the start of `line` (ignoring leading
 * whitespace; accepts both starred and unstarred forms).
 * Returns the command name, or `null` when the line is not a heading.
 */
export function lineHeadingCmd(line: string): HeadingCmd | null {
  const m =
    /^[ \t]*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(?:\*?\{|\s|$)/.exec(
      line
    );
  if (m === null) return null;
  return m[1] as HeadingCmd;
}

/**
 * Return `line` with its heading command replaced by the next-larger heading
 * (e.g. `\subsection` → `\section`), or `null` when the line is not a heading
 * or is already at the largest level (`\part`).
 */
export function promoteHeading(line: string): string | null {
  const cmd = lineHeadingCmd(line);
  if (cmd === null) return null;
  const idx = HEADING_ORDER.indexOf(cmd);
  if (idx <= 0) return null;
  return line.replace(`\\${cmd}`, `\\${HEADING_ORDER[idx - 1]}`);
}

/**
 * Return `line` with its heading command replaced by the next-smaller heading
 * (e.g. `\section` → `\subsection`), or `null` when the line is not a heading
 * or is already at the smallest level (`\subparagraph`).
 */
export function demoteHeading(line: string): string | null {
  const cmd = lineHeadingCmd(line);
  if (cmd === null) return null;
  const idx = HEADING_ORDER.indexOf(cmd);
  if (idx >= HEADING_ORDER.length - 1) return null;
  return line.replace(`\\${cmd}`, `\\${HEADING_ORDER[idx + 1]}`);
}

/**
 * A targeted source edit: a list of non-overlapping, position-sorted changes
 * and the resulting selection anchors.
 */
export interface VisualEdit {
  readonly changes: ReadonlyArray<{
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }>;
  readonly anchor: number;
  readonly head: number;
}

/**
 * Toggle `\textbf{…}` around the selection `[from, to]` in `src`.
 *
 * Unwrap when the selection is exactly the *content* of an existing
 * `\textbf{…}` (i.e. the source has `\textbf{` immediately before `from`
 * and `}` immediately after `to`), or when the selection text itself is a
 * complete `\textbf{…}` command. Otherwise wrap with `\textbf{…}`.
 */
export function toggleBold(src: string, from: number, to: number): VisualEdit {
  // Unwrap via surrounding context (\textbf{ before, } after)
  if (from >= 8 && src.slice(from - 8, from) === '\\textbf{' && src[to] === '}') {
    return {
      changes: [
        { from: from - 8, to: from, insert: '' },
        { from: to, to: to + 1, insert: '' }
      ],
      anchor: from - 8,
      head: to - 8
    };
  }
  // Unwrap when the selection text itself is \textbf{content}
  const selected = src.slice(from, to);
  const mFull = /^\\textbf\{([^}]*)\}$/.exec(selected);
  if (mFull !== null) {
    return {
      changes: [{ from, to, insert: mFull[1] }],
      anchor: from,
      head: from + mFull[1].length
    };
  }
  // Wrap the selection
  const wrapped = `\\textbf{${selected}}`;
  return {
    changes: [{ from, to, insert: wrapped }],
    anchor: from,
    head: from + wrapped.length
  };
}

/**
 * Toggle `\textit{…}` (or unwrap `\emph{…}`) around the selection `[from,
 * to]` in `src`. Wraps with `\textit{…}`.
 *
 * Unwrap when the selection content sits inside an existing `\textit{…}` or
 * `\emph{…}` in the source, or when the selection itself is such a command.
 */
export function toggleItalic(src: string, from: number, to: number): VisualEdit {
  // Unwrap \textit{ … }
  if (from >= 8 && src.slice(from - 8, from) === '\\textit{' && src[to] === '}') {
    return {
      changes: [
        { from: from - 8, to: from, insert: '' },
        { from: to, to: to + 1, insert: '' }
      ],
      anchor: from - 8,
      head: to - 8
    };
  }
  // Unwrap \emph{ … }
  if (from >= 6 && src.slice(from - 6, from) === '\\emph{' && src[to] === '}') {
    return {
      changes: [
        { from: from - 6, to: from, insert: '' },
        { from: to, to: to + 1, insert: '' }
      ],
      anchor: from - 6,
      head: to - 6
    };
  }
  // Unwrap when selection text itself is \textit{content}
  const selected = src.slice(from, to);
  const mTextit = /^\\textit\{([^}]*)\}$/.exec(selected);
  if (mTextit !== null) {
    return {
      changes: [{ from, to, insert: mTextit[1] }],
      anchor: from,
      head: from + mTextit[1].length
    };
  }
  // Unwrap when selection text itself is \emph{content}
  const mEmph = /^\\emph\{([^}]*)\}$/.exec(selected);
  if (mEmph !== null) {
    return {
      changes: [{ from, to, insert: mEmph[1] }],
      anchor: from,
      head: from + mEmph[1].length
    };
  }
  // Wrap with \textit{…}
  const wrapped = `\\textit{${selected}}`;
  return {
    changes: [{ from, to, insert: wrapped }],
    anchor: from,
    head: from + wrapped.length
  };
}

/**
 * Return `true` when `lineText` starts (ignoring leading whitespace) with
 * `\item` followed by a space, `{`, or end-of-string — i.e. it is a list item
 * line and not a `\itemize` environment opener.
 */
export function isItemLine(lineText: string): boolean {
  return /^[ \t]*\\item(?:\s|$)/.test(lineText);
}
