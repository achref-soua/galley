import { describe, it, expect } from 'vitest';
import {
  buildRegex,
  escapeRegex,
  searchInContent,
  replaceInContent
} from '../src/lib/search-content';

const baseQuery = { pattern: '', caseSensitive: false, wholeWord: false, useRegex: false };

describe('escapeRegex', () => {
  it('escapes regex special characters', () => {
    const special = '.*+?^${}()|[]\\';
    const escaped = escapeRegex(special);
    expect(() => new RegExp(escaped)).not.toThrow();
    expect(new RegExp(escaped).test(special)).toBe(true);
  });

  it('leaves plain strings unchanged in effect', () => {
    expect(escapeRegex('hello')).toBe('hello');
  });
});

describe('buildRegex', () => {
  it('returns null for empty pattern', () => {
    expect(buildRegex({ ...baseQuery, pattern: '' })).toBeNull();
  });

  it('returns null for invalid regex when useRegex is true', () => {
    expect(buildRegex({ ...baseQuery, pattern: '[invalid', useRegex: true })).toBeNull();
  });

  it('builds a case-insensitive regex by default', () => {
    const re = buildRegex({ ...baseQuery, pattern: 'Hello' });
    expect(re).not.toBeNull();
    expect(re!.flags).toContain('i');
  });

  it('builds a case-sensitive regex when caseSensitive is true', () => {
    const re = buildRegex({ ...baseQuery, pattern: 'Hello', caseSensitive: true });
    expect(re!.flags).not.toContain('i');
  });

  it('wraps pattern with \\b…\\b when wholeWord is true', () => {
    const re = buildRegex({ ...baseQuery, pattern: 'foo', wholeWord: true });
    expect(re!.source).toContain('\\b');
  });

  it('escapes the pattern when useRegex is false', () => {
    const re = buildRegex({ ...baseQuery, pattern: '1+1' });
    expect(re!.test('1+1')).toBe(true);
    expect(re!.test('111')).toBe(false);
  });

  it('uses the raw pattern as regex when useRegex is true', () => {
    const re = buildRegex({ ...baseQuery, pattern: '\\d+', useRegex: true });
    expect(re!.test('123')).toBe(true);
  });
});

describe('searchInContent', () => {
  it('returns empty for empty pattern', () => {
    expect(searchInContent('hello', { ...baseQuery, pattern: '' })).toHaveLength(0);
  });

  it('returns empty when no match is found', () => {
    expect(searchInContent('hello', { ...baseQuery, pattern: 'xyz' })).toHaveLength(0);
  });

  it('finds a single match and reports correct line/column', () => {
    const results = searchInContent('hello world', { ...baseQuery, pattern: 'world' });
    expect(results).toHaveLength(1);
    expect(results[0].line).toBe(1);
    expect(results[0].column).toBe(7);
    expect(results[0].lineText).toBe('hello world');
    expect(results[0].matchStart).toBe(6);
    expect(results[0].matchEnd).toBe(11);
  });

  it('finds matches on multiple lines', () => {
    const results = searchInContent('foo\nfoo\nbar', { ...baseQuery, pattern: 'foo' });
    expect(results).toHaveLength(2);
    expect(results[0].line).toBe(1);
    expect(results[1].line).toBe(2);
  });

  it('is case-insensitive by default', () => {
    const results = searchInContent('Hello', { ...baseQuery, pattern: 'hello' });
    expect(results).toHaveLength(1);
  });

  it('respects caseSensitive: true', () => {
    expect(
      searchInContent('Hello', { ...baseQuery, pattern: 'hello', caseSensitive: true })
    ).toHaveLength(0);
    expect(
      searchInContent('hello', { ...baseQuery, pattern: 'hello', caseSensitive: true })
    ).toHaveLength(1);
  });

  it('respects wholeWord matching', () => {
    expect(
      searchInContent('foobar foo', { ...baseQuery, pattern: 'foo', wholeWord: true })
    ).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    const results = searchInContent('line1\r\nline2', { ...baseQuery, pattern: 'line2' });
    expect(results).toHaveLength(1);
    expect(results[0].line).toBe(2);
  });

  it('returns empty for an invalid regex pattern', () => {
    expect(searchInContent('text', { ...baseQuery, pattern: '[bad', useRegex: true })).toHaveLength(
      0
    );
  });

  it('finds multiple matches on the same line', () => {
    const results = searchInContent('aa aa aa', { ...baseQuery, pattern: 'aa' });
    expect(results).toHaveLength(3);
  });

  it('handles zero-length regex matches without looping forever', () => {
    // a* can match zero-length strings between characters — the guard advances lastIndex.
    const results = searchInContent('ab', { ...baseQuery, pattern: 'x*', useRegex: true });
    // x* matches zero-length at every position; we just verify it completes and returns results.
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('replaceInContent', () => {
  it('returns original content when pattern is empty', () => {
    const content = 'hello';
    expect(replaceInContent(content, { ...baseQuery, pattern: '' }, 'x')).toBe(content);
  });

  it('returns original content for invalid regex', () => {
    const content = 'hello';
    expect(replaceInContent(content, { ...baseQuery, pattern: '[bad', useRegex: true }, 'x')).toBe(
      content
    );
  });

  it('replaces all occurrences of a literal pattern', () => {
    expect(replaceInContent('foo foo foo', { ...baseQuery, pattern: 'foo' }, 'bar')).toBe(
      'bar bar bar'
    );
  });

  it('replaces using regex back-references when useRegex is true', () => {
    const result = replaceInContent(
      'hello world',
      { ...baseQuery, pattern: '(\\w+)', useRegex: true },
      '[$1]'
    );
    expect(result).toBe('[hello] [world]');
  });
});
