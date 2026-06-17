import { describe, it, expect } from 'vitest';
import { isSaveShortcut } from '../src/lib/keymap';

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
