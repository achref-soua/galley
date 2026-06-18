import { describe, it, expect } from 'vitest';
import { stripLatex, countWords, formatCount } from '../src/lib/count';

describe('stripLatex', () => {
  it('strips line comments', () => {
    expect(stripLatex('hello % this is a comment\nworld')).not.toContain('%');
  });

  it('does not strip escaped percent signs', () => {
    const result = stripLatex('100\\% done');
    expect(result).toContain('done');
  });

  it('replaces display math $$…$$', () => {
    const result = stripLatex('text $$x^2$$ more');
    expect(result).not.toContain('x^2');
    expect(result).toContain('text');
    expect(result).toContain('more');
  });

  it('replaces display math \\[…\\]', () => {
    const result = stripLatex('text \\[x^2\\] more');
    expect(result).not.toContain('x^2');
  });

  it('replaces inline math $…$', () => {
    const result = stripLatex('the formula $E=mc^2$ is famous');
    expect(result).not.toContain('E=mc');
    expect(result).toContain('famous');
  });

  it('replaces inline math \\(…\\)', () => {
    const result = stripLatex('value \\(x+y\\) here');
    expect(result).not.toContain('x+y');
  });

  it('removes LaTeX commands', () => {
    const result = stripLatex('\\textbf{Hello} world');
    expect(result).not.toContain('\\textbf');
    expect(result).toContain('Hello');
    expect(result).toContain('world');
  });

  it('removes braces and brackets', () => {
    const result = stripLatex('{curly} [square]');
    expect(result).not.toContain('{');
    expect(result).not.toContain('[');
  });
});

describe('countWords', () => {
  it('returns zeros for empty string', () => {
    expect(countWords('')).toEqual({ words: 0, chars: 0, charsNoSpaces: 0 });
  });

  it('counts plain text words', () => {
    const result = countWords('hello world foo');
    expect(result.words).toBe(3);
  });

  it('counts chars and charsNoSpaces after stripping', () => {
    const result = countWords('ab cd');
    expect(result.chars).toBeGreaterThan(0);
    expect(result.charsNoSpaces).toBeLessThanOrEqual(result.chars);
  });

  it('strips LaTeX markup before counting', () => {
    const result = countWords('\\textbf{hello} world');
    expect(result.words).toBe(2);
  });

  it('counts words in multi-paragraph source', () => {
    const result = countWords('one two\nthree four\nfive');
    expect(result.words).toBe(5);
  });
});

describe('formatCount', () => {
  it('formats a count as "N words · M chars"', () => {
    expect(formatCount({ words: 3, chars: 20, charsNoSpaces: 17 })).toBe('3 words · 20 chars');
  });

  it('formats zeros', () => {
    expect(formatCount({ words: 0, chars: 0, charsNoSpaces: 0 })).toBe('0 words · 0 chars');
  });
});
