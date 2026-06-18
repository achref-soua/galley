import { describe, it, expect } from 'vitest';
import { parseIncludes, resolveIncludePath } from '../src/lib/include-graph';

describe('parseIncludes', () => {
  it('returns an empty list for an empty source', () => {
    expect(parseIncludes('')).toEqual([]);
  });

  it('finds \\input, \\include, and \\subfile', () => {
    const src = '\\input{ch1}\n\\include{ch2}\n\\subfile{ch3}';
    expect(parseIncludes(src)).toEqual(['ch1', 'ch2', 'ch3']);
  });

  it('skips fully commented lines', () => {
    const src = '% \\input{nope}\n\\input{yes}';
    expect(parseIncludes(src)).toEqual(['yes']);
  });

  it('strips an inline comment before searching', () => {
    const src = '\\input{a} % \\input{b}';
    expect(parseIncludes(src)).toEqual(['a']);
  });

  it('trims whitespace inside braces', () => {
    const src = '\\input{ spaced }';
    expect(parseIncludes(src)).toEqual(['spaced']);
  });

  it('ignores empty braces', () => {
    const src = '\\input{}';
    expect(parseIncludes(src)).toEqual([]);
  });

  it('handles a missing closing brace gracefully', () => {
    const src = '\\input{unclosed';
    expect(parseIncludes(src)).toEqual([]);
  });

  it('finds multiple includes on one line', () => {
    const src = '\\input{a}\\include{b}';
    expect(parseIncludes(src)).toEqual(['a', 'b']);
  });

  it('covers the no-percent and percent cases of stripComment', () => {
    // No percent: the whole line is used.
    expect(parseIncludes('\\input{here}')).toEqual(['here']);
    // Leading percent: line becomes empty, no includes found.
    expect(parseIncludes('% \\input{gone}')).toEqual([]);
  });
});

describe('resolveIncludePath', () => {
  it('returns an empty string for an empty input', () => {
    expect(resolveIncludePath('')).toBe('');
  });

  it('appends .tex to an extensionless bare filename', () => {
    expect(resolveIncludePath('chapter')).toBe('chapter.tex');
  });

  it('appends .tex to an extensionless path', () => {
    expect(resolveIncludePath('path/to/chapter')).toBe('path/to/chapter.tex');
  });

  it('leaves a path that already has an extension unchanged', () => {
    expect(resolveIncludePath('chapter.tex')).toBe('chapter.tex');
    expect(resolveIncludePath('refs.bib')).toBe('refs.bib');
    expect(resolveIncludePath('figure.pdf')).toBe('figure.pdf');
  });

  it('resolves paths where the directory has dots but the filename does not', () => {
    // The dot is in the parent directory, not the filename.
    expect(resolveIncludePath('path.v2/chapter')).toBe('path.v2/chapter.tex');
  });

  it('leaves a path with a dot in the directory and extension in the filename unchanged', () => {
    expect(resolveIncludePath('path.v2/chapter.tex')).toBe('path.v2/chapter.tex');
  });

  it('appends .tex to a Windows-style path without extension', () => {
    expect(resolveIncludePath('path\\to\\chapter')).toBe('path\\to\\chapter.tex');
  });
});
