import { describe, it, expect } from 'vitest';
import { isCompileShortcut, isSaveShortcut } from '../src/lib/keymap';

describe('isSaveShortcut', () => {
  it('matches Ctrl+S and ⌘S, case-insensitively', () => {
    expect(isSaveShortcut({ ctrlKey: true, metaKey: false, key: 's' })).toBe(true);
    expect(isSaveShortcut({ ctrlKey: false, metaKey: true, key: 'S' })).toBe(true);
  });

  it('ignores S without a modifier and other keys with one', () => {
    expect(isSaveShortcut({ ctrlKey: false, metaKey: false, key: 's' })).toBe(false);
    expect(isSaveShortcut({ ctrlKey: true, metaKey: false, key: 'a' })).toBe(false);
  });
});

describe('isCompileShortcut', () => {
  it('matches Ctrl+B and ⌘B, case-insensitively', () => {
    expect(isCompileShortcut({ ctrlKey: true, metaKey: false, key: 'b' })).toBe(true);
    expect(isCompileShortcut({ ctrlKey: false, metaKey: true, key: 'B' })).toBe(true);
  });

  it('ignores B without a modifier and other keys with one', () => {
    expect(isCompileShortcut({ ctrlKey: false, metaKey: false, key: 'b' })).toBe(false);
    expect(isCompileShortcut({ ctrlKey: true, metaKey: false, key: 'a' })).toBe(false);
  });
});
