import { describe, it, expect } from 'vitest';
import { nextFocusIndex } from '../src/lib/focus-trap';

describe('focus-trap — nextFocusIndex', () => {
  it('returns -1 when there is nothing focusable', () => {
    expect(nextFocusIndex(0, 0, false)).toBe(-1);
  });

  it('advances forward and wraps to the start', () => {
    expect(nextFocusIndex(3, 0, false)).toBe(1);
    expect(nextFocusIndex(3, 2, false)).toBe(0);
  });

  it('advances backward and wraps to the end', () => {
    expect(nextFocusIndex(3, 2, true)).toBe(1);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
  });
});
