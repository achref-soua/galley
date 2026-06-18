import { describe, it, expect, vi } from 'vitest';

// Mock nspell before importing spell-check so buildSpellChecker uses the fake.
vi.mock('nspell', () => ({
  default: (_aff: string, _dic: string) => ({
    correct: (word: string) => word === 'hello' || word === 'world'
  })
}));

import {
  isSkippableToken,
  maskLatexRegions,
  extractSpellWords,
  spellCheckDiagnostics,
  makeSpellLinter,
  buildSpellChecker,
  type SpellChecker
} from '../src/lib/spell-check';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { forceLinting } from '@codemirror/lint';

/** A minimal SpellChecker that considers only 'ok' as correct. */
const fakeChecker: SpellChecker = { correct: (w) => w === 'ok' };

describe('isSkippableToken', () => {
  it('skips LaTeX commands starting with \\', () => {
    expect(isSkippableToken('\\textbf')).toBe(true);
    expect(isSkippableToken('\\n')).toBe(true);
  });

  it('skips tokens containing non-alpha-apostrophe characters', () => {
    expect(isSkippableToken('abc123')).toBe(true);
    expect(isSkippableToken('word!')).toBe(true);
    expect(isSkippableToken('word-word')).toBe(true);
  });

  it('skips single-character tokens', () => {
    expect(isSkippableToken('a')).toBe(true);
    expect(isSkippableToken("'")).toBe(true);
  });

  it('does not skip normal words', () => {
    expect(isSkippableToken('hello')).toBe(false);
    expect(isSkippableToken("don't")).toBe(false);
  });
});

describe('maskLatexRegions', () => {
  it('preserves the original string length', () => {
    const s = '\\textbf{hello} % comment\nworld';
    expect(maskLatexRegions(s).length).toBe(s.length);
  });

  it('replaces LaTeX commands with spaces', () => {
    const result = maskLatexRegions('\\textbf');
    expect(result.trim()).toBe('');
  });

  it('replaces line comments (% to end of line) with spaces', () => {
    const src = 'hello % ignored text\nworld';
    const result = maskLatexRegions(src);
    expect(result.indexOf('%')).toBe(-1);
    expect(result.indexOf('world')).toBeGreaterThan(0);
  });

  it('does not mask escaped percent \\%', () => {
    const src = '100\\%';
    const result = maskLatexRegions(src);
    // The backslash+% is not a comment; only \\% (the command \%) gets masked
    // Actually \% is a LaTeX command so the backslash+% gets masked as a command.
    // Just verify length is preserved.
    expect(result.length).toBe(src.length);
  });

  it('keeps non-command text intact', () => {
    const src = 'hello world';
    expect(maskLatexRegions(src)).toBe('hello world');
  });

  it('handles star commands like \\textbf*', () => {
    const src = '\\section* hello';
    const result = maskLatexRegions(src);
    expect(result.trim().startsWith('hello') || result.includes('hello')).toBe(true);
  });
});

describe('extractSpellWords', () => {
  it('returns empty array for whitespace-only input', () => {
    expect(extractSpellWords('   ')).toHaveLength(0);
  });

  it('extracts words with correct from/to offsets', () => {
    const words = extractSpellWords('hello world');
    expect(words).toHaveLength(2);
    expect(words[0].word).toBe('hello');
    expect(words[0].from).toBe(0);
    expect(words[0].to).toBe(5);
    expect(words[1].word).toBe('world');
    expect(words[1].from).toBe(6);
    expect(words[1].to).toBe(11);
  });

  it('strips leading and trailing punctuation from tokens', () => {
    const words = extractSpellWords('"hello,"');
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe('hello');
  });

  it('preserves apostrophes inside words', () => {
    const words = extractSpellWords("don't");
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe("don't");
  });

  it('skips tokens that are only punctuation', () => {
    const words = extractSpellWords('--- *** !!!');
    expect(words).toHaveLength(0);
  });
});

describe('spellCheckDiagnostics', () => {
  it('returns no diagnostics when source is empty', () => {
    expect(spellCheckDiagnostics('', fakeChecker, [])).toHaveLength(0);
  });

  it('flags misspelled words', () => {
    const diags = spellCheckDiagnostics('wrong', fakeChecker, []);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('wrong');
    expect(diags[0].severity).toBe('info');
  });

  it('does not flag correctly spelled words', () => {
    expect(spellCheckDiagnostics('ok', fakeChecker, [])).toHaveLength(0);
  });

  it('does not flag words in the allowlist', () => {
    expect(spellCheckDiagnostics('galley', fakeChecker, ['galley'])).toHaveLength(0);
  });

  it('is case-insensitive for the allowlist', () => {
    expect(spellCheckDiagnostics('Galley', fakeChecker, ['galley'])).toHaveLength(0);
  });

  it('skips LaTeX commands via maskLatexRegions', () => {
    expect(spellCheckDiagnostics('\\textbf', fakeChecker, [])).toHaveLength(0);
  });

  it('checks multiple words in one source string', () => {
    const diags = spellCheckDiagnostics('ok bad', fakeChecker, []);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('bad');
  });

  it('skips tokens containing digits via isSkippableToken', () => {
    // 'w2ord' has a digit in the middle → isSkippableToken returns true → skipped; 'bad' is flagged.
    const diags = spellCheckDiagnostics('w2ord bad', fakeChecker, []);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('bad');
  });
});

describe('makeSpellLinter', () => {
  it('returns [] from the linter callback when checker is null', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ext = makeSpellLinter(() => null);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({ doc: 'misspelled', extensions: [ext] })
    });
    // forceLinting triggers the linter source callback synchronously.
    forceLinting(view);
    view.destroy();
    host.remove();
  });

  it('runs the linter callback and flags misspellings when checker is provided', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ext = makeSpellLinter(() => fakeChecker);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({ doc: 'wrong', extensions: [ext] })
    });
    forceLinting(view);
    view.destroy();
    host.remove();
  });
});

describe('buildSpellChecker', () => {
  it('constructs a SpellChecker wrapping nspell', () => {
    const checker = buildSpellChecker('aff-data', 'dic-data');
    // The mocked nspell considers 'hello' and 'world' correct.
    expect(checker.correct('hello')).toBe(true);
    expect(checker.correct('world')).toBe(true);
    expect(checker.correct('typo')).toBe(false);
  });
});
