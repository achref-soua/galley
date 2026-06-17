import { describe, it, expect } from 'vitest';
import { basename, classifyKind, buildFileTree } from '../src/lib/file-tree';

describe('basename', () => {
  it('returns the last segment, or the whole string at the top level', () => {
    expect(basename('chapters/intro.tex')).toBe('intro.tex');
    expect(basename('main.tex')).toBe('main.tex');
  });
});

describe('classifyKind', () => {
  it('classifies by extension', () => {
    expect(classifyKind('main.tex')).toBe('tex');
    expect(classifyKind('a.ltx')).toBe('tex');
    expect(classifyKind('refs.bib')).toBe('bib');
    for (const asset of ['f.png', 'f.JPG', 'f.jpeg', 'f.pdf', 'f.eps', 'f.svg']) {
      expect(classifyKind(asset)).toBe('asset');
    }
    expect(classifyKind('notes.md')).toBe('other');
    expect(classifyKind('README')).toBe('other');
    // A dotfile (leading dot, no real extension) is "other".
    expect(classifyKind('.gitignore')).toBe('other');
  });
});

describe('buildFileTree', () => {
  it('is empty for no files', () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it('emits directory headers above their files, sorted and de-duplicated', () => {
    const tree = buildFileTree(['main.tex', 'a/b/c.tex', 'a/b/d.tex', 'a/e.tex']);
    expect(tree).toEqual([
      { name: 'a', path: 'a', depth: 0, isDir: true, kind: 'other' },
      { name: 'b', path: 'a/b', depth: 1, isDir: true, kind: 'other' },
      { name: 'c.tex', path: 'a/b/c.tex', depth: 2, isDir: false, kind: 'tex' },
      { name: 'd.tex', path: 'a/b/d.tex', depth: 2, isDir: false, kind: 'tex' },
      { name: 'e.tex', path: 'a/e.tex', depth: 1, isDir: false, kind: 'tex' },
      { name: 'main.tex', path: 'main.tex', depth: 0, isDir: false, kind: 'tex' }
    ]);
  });

  it('tolerates a leading slash by dropping empty segments', () => {
    expect(buildFileTree(['/x.tex'])).toEqual([
      { name: 'x.tex', path: '/x.tex', depth: 0, isDir: false, kind: 'tex' }
    ]);
  });
});
