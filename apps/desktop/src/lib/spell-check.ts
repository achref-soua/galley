/**
 * Spell-check linter for the LaTeX editor.
 *
 * The pure helper functions ({@link isSkippableToken}, {@link extractSpellWords},
 * {@link spellCheckDiagnostics}) are exported so they can be tested directly
 * without a running editor. The CM6 extension itself is returned by
 * {@link makeSpellLinter}, which accepts an injectable checker so tests can
 * drive all branches without a real dictionary.
 */

import nspell from 'nspell';
import { linter, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';

/** Anything that can decide whether a word is correctly spelled. */
export interface SpellChecker {
  correct(word: string): boolean;
}

/**
 * Returns true when `token` should be skipped by the spell checker:
 * - LaTeX commands (`\foo`)
 * - Tokens containing digits (numbers, measurements like `100px`)
 * - Tokens containing non-alphabetic non-apostrophe characters
 */
export function isSkippableToken(token: string): boolean {
  if (token.startsWith('\\')) {
    return true;
  }
  if (/[^a-zA-Z']/.test(token)) {
    return true;
  }
  if (token.length < 2) {
    return true;
  }
  return false;
}

/**
 * Strip LaTeX commands, math mode regions, and comments from `source`,
 * returning a plain-text version suitable for spell checking. The returned
 * string has the same byte length as `source` so that the word positions
 * can be mapped back to the original offsets.
 *
 * Strategy: replace stripped regions with spaces (same length) to preserve
 * offsets. Because the replaced chars are whitespace they cannot form words.
 */
export function maskLatexRegions(source: string): string {
  const chars = source.split('');

  function mask(start: number, end: number): void {
    for (let i = start; i < end && i < chars.length; i += 1) {
      chars[i] = ' ';
    }
  }

  let i = 0;
  while (i < chars.length) {
    // Line comments: % to end of line (but not \%)
    if (chars[i] === '%' && (i === 0 || chars[i - 1] !== '\\')) {
      const start = i;
      while (i < chars.length && chars[i] !== '\n') {
        i += 1;
      }
      mask(start, i);
      continue;
    }
    // LaTeX commands: \word (mask the backslash and name)
    if (chars[i] === '\\' && i + 1 < chars.length && /[a-zA-Z]/.test(chars[i + 1])) {
      const start = i;
      i += 1;
      while (i < chars.length && /[a-zA-Z*]/.test(chars[i])) {
        i += 1;
      }
      mask(start, i);
      continue;
    }
    i += 1;
  }

  return chars.join('');
}

/** A word extracted from a source string with its document offsets. */
export interface SpellWord {
  word: string;
  from: number;
  to: number;
}

/**
 * Extract whitespace-delimited tokens from the masked source for spell
 * checking. Each token's `from`/`to` are byte offsets into the *original*
 * source string (the masking preserves offsets).
 */
export function extractSpellWords(masked: string): SpellWord[] {
  const words: SpellWord[] = [];
  const re = /[^\s]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const raw = m[0];
    // Strip leading/trailing punctuation from the token for the spell check
    // (e.g. "word," → "word", "don't" → keep apostrophe inside).
    const stripped = raw.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '');
    if (stripped.length === 0) {
      continue;
    }
    const leadingSkipped = raw.length - raw.replace(/^[^a-zA-Z']+/, '').length;
    words.push({
      word: stripped,
      from: m.index + leadingSkipped,
      to: m.index + leadingSkipped + stripped.length
    });
  }
  return words;
}

/**
 * Compute spell-check diagnostics for `source`, using `checker` and
 * `allowlist`. Returns CM6 `Diagnostic` objects ready for the linter.
 */
export function spellCheckDiagnostics(
  source: string,
  checker: SpellChecker,
  allowlist: string[]
): CmDiagnostic[] {
  const masked = maskLatexRegions(source);
  const words = extractSpellWords(masked);
  const results: CmDiagnostic[] = [];
  for (const { word, from, to } of words) {
    if (isSkippableToken(word)) {
      continue;
    }
    const lower = word.toLowerCase();
    if (allowlist.includes(lower)) {
      continue;
    }
    if (!checker.correct(word)) {
      results.push({
        from,
        to,
        severity: 'info',
        message: `Possible misspelling: "${word}"`
      });
    }
  }
  return results;
}

/**
 * Construct a {@link SpellChecker} from hunspell `.aff` and `.dic` data
 * provided as strings. Used by the app to build a real checker after
 * fetching the dictionary files; tests inject a fake via the interface.
 */
export function buildSpellChecker(aff: string, dic: string): SpellChecker {
  const checker = nspell(aff, dic);
  return { correct: (word: string) => checker.correct(word) };
}

/**
 * Build a CM6 linter extension backed by `getChecker`. When `getChecker`
 * returns `null` the linter produces no diagnostics (spell-check off).
 */
export function makeSpellLinter(
  getChecker: () => SpellChecker | null,
  allowlist: string[] = []
): Extension {
  return linter((view) => {
    const checker = getChecker();
    if (checker === null) {
      return [];
    }
    return spellCheckDiagnostics(view.state.doc.toString(), checker, allowlist);
  });
}
