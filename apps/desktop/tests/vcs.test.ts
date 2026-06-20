import { describe, it, expect } from 'vitest';
import { computeDiff, diffStats } from '../src/lib/vcs';

describe('computeDiff', () => {
  it('returns empty for two empty strings', () => {
    expect(computeDiff('', '')).toEqual([]);
  });

  it('adds all lines when old is empty', () => {
    const result = computeDiff('', 'a\nb');
    expect(result).toHaveLength(2);
    expect(result.every((d) => d.kind === 'added')).toBe(true);
    expect(result[0].text).toBe('a');
    expect(result[1].text).toBe('b');
  });

  it('removes all lines when new is empty', () => {
    const result = computeDiff('a\nb', '');
    expect(result).toHaveLength(2);
    expect(result.every((d) => d.kind === 'removed')).toBe(true);
  });

  it('marks unchanged lines as context', () => {
    const s = 'alpha\nbeta\ngamma';
    const result = computeDiff(s, s);
    expect(result.every((d) => d.kind === 'context')).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('detects a single-line insertion', () => {
    const result = computeDiff('a\nc', 'a\nb\nc');
    const added = result.filter((d) => d.kind === 'added');
    expect(added).toHaveLength(1);
    expect(added[0].text).toBe('b');
  });

  it('detects a single-line removal', () => {
    const result = computeDiff('a\nb\nc', 'a\nc');
    const removed = result.filter((d) => d.kind === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0].text).toBe('b');
  });

  it('handles a full replacement', () => {
    const result = computeDiff('hello', 'world');
    expect(result.some((d) => d.kind === 'removed' && d.text === 'hello')).toBe(true);
    expect(result.some((d) => d.kind === 'added' && d.text === 'world')).toBe(true);
  });

  it('handles interleaved changes', () => {
    const result = computeDiff('a\nb\nc\nd', 'a\nx\nc\ny');
    const added = result.filter((d) => d.kind === 'added');
    const removed = result.filter((d) => d.kind === 'removed');
    const context = result.filter((d) => d.kind === 'context');
    expect(added).toHaveLength(2);
    expect(removed).toHaveLength(2);
    expect(context).toHaveLength(2);
  });

  it('handles single-line old empty new single line', () => {
    const result = computeDiff('', 'single');
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('added');
    expect(result[0].text).toBe('single');
  });

  it('handles single-line new empty old single line', () => {
    const result = computeDiff('only', '');
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('removed');
  });

  it('handles multiple additions at end', () => {
    const result = computeDiff('a', 'a\nb\nc');
    const added = result.filter((d) => d.kind === 'added');
    expect(added).toHaveLength(2);
  });

  it('handles multiple removals at start', () => {
    const result = computeDiff('x\ny\nz', 'z');
    const removed = result.filter((d) => d.kind === 'removed');
    expect(removed).toHaveLength(2);
  });
});

describe('diffStats', () => {
  it('returns zero for identical content', () => {
    expect(diffStats('a\nb', 'a\nb')).toEqual({ linesAdded: 0, linesRemoved: 0 });
  });

  it('counts additions', () => {
    expect(diffStats('a', 'a\nb')).toEqual({ linesAdded: 1, linesRemoved: 0 });
  });

  it('counts removals', () => {
    expect(diffStats('a\nb', 'a')).toEqual({ linesAdded: 0, linesRemoved: 1 });
  });

  it('counts mixed changes', () => {
    const stats = diffStats('a\nb', 'a\nc');
    expect(stats.linesAdded).toBe(1);
    expect(stats.linesRemoved).toBe(1);
  });

  it('handles both empty', () => {
    expect(diffStats('', '')).toEqual({ linesAdded: 0, linesRemoved: 0 });
  });
});
