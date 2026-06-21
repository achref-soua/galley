import { describe, it, expect } from 'vitest';
import { classifyOpenable, isGalleyOpenable } from '../src/lib/file-assoc';

describe('file-assoc — classifyOpenable', () => {
  it('classifies .tex and .galley, case-insensitively', () => {
    expect(classifyOpenable('/home/a/paper.tex')).toBe('tex');
    expect(classifyOpenable('/home/a/PAPER.TEX')).toBe('tex');
    expect(classifyOpenable('/home/a/project.galley')).toBe('galley');
  });

  it('returns null for unsupported files', () => {
    expect(classifyOpenable('/home/a/notes.md')).toBeNull();
    expect(classifyOpenable('/home/a/figure.png')).toBeNull();
  });
});

describe('file-assoc — isGalleyOpenable', () => {
  it('accepts the openable kinds and rejects the rest', () => {
    expect(isGalleyOpenable('main.tex')).toBe(true);
    expect(isGalleyOpenable('proj.galley')).toBe(true);
    expect(isGalleyOpenable('readme.txt')).toBe(false);
  });
});
