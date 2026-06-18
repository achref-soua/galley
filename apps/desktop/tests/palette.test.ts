import { describe, it, expect, vi } from 'vitest';
import { subsequenceMatch, filterActions, type PaletteAction } from '../src/lib/palette';

function action(id: string, label: string): PaletteAction {
  return { id, label, run: vi.fn() };
}

describe('subsequenceMatch', () => {
  it('matches when all needle chars appear in order in haystack', () => {
    expect(subsequenceMatch('cmp', 'compile')).toBe(true);
    expect(subsequenceMatch('sv', 'save')).toBe(true);
    expect(subsequenceMatch('ts', 'toggle sidebar')).toBe(true);
  });

  it('returns false when a needle char is missing', () => {
    expect(subsequenceMatch('xyz', 'compile')).toBe(false);
  });

  it('returns false when chars appear out of order', () => {
    expect(subsequenceMatch('ba', 'ab')).toBe(false);
  });

  it('matches an empty needle against any haystack', () => {
    expect(subsequenceMatch('', 'anything')).toBe(true);
    expect(subsequenceMatch('', '')).toBe(true);
  });

  it('returns false when needle is longer than haystack', () => {
    expect(subsequenceMatch('toolong', 'no')).toBe(false);
  });

  it('is case-sensitive (caller should lowercase both sides)', () => {
    expect(subsequenceMatch('c', 'Compile')).toBe(false);
    expect(subsequenceMatch('c', 'compile')).toBe(true);
  });
});

describe('filterActions', () => {
  const actions = [
    action('save', 'Save'),
    action('compile', 'Compile'),
    action('find', 'Find in Project'),
    action('settings', 'Open Settings')
  ];

  it('returns all actions for an empty query', () => {
    expect(filterActions('', actions)).toHaveLength(4);
    expect(filterActions('   ', actions)).toHaveLength(4);
  });

  it('filters case-insensitively by subsequence', () => {
    const result = filterActions('cmp', actions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('compile');
  });

  it('matches multiple actions when the query fits more than one label', () => {
    // 's' appears in 'Save', 'Find in Project' (no), 'Open Settings' (yes) but also 'Save'
    const result = filterActions('s', actions);
    expect(result.map((a) => a.id)).toContain('save');
    expect(result.map((a) => a.id)).toContain('settings');
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterActions('zzz', actions)).toHaveLength(0);
  });

  it('trims leading/trailing whitespace from the query', () => {
    const result = filterActions('  save  ', actions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('save');
  });
});
