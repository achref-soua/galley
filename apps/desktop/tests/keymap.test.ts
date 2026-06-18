import { describe, it, expect } from 'vitest';
import {
  isCompileShortcut,
  isSaveShortcut,
  isCommandPaletteShortcut,
  isSearchShortcut
} from '../src/lib/keymap';

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

describe('isCommandPaletteShortcut', () => {
  it('matches Ctrl+Shift+P and ⌘⇧P, case-insensitively', () => {
    expect(
      isCommandPaletteShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'p' })
    ).toBe(true);
    expect(
      isCommandPaletteShortcut({ ctrlKey: false, metaKey: true, shiftKey: true, key: 'P' })
    ).toBe(true);
  });

  it('requires Shift to be held', () => {
    expect(
      isCommandPaletteShortcut({ ctrlKey: true, metaKey: false, shiftKey: false, key: 'p' })
    ).toBe(false);
  });

  it('ignores wrong keys', () => {
    expect(
      isCommandPaletteShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'k' })
    ).toBe(false);
  });
});

describe('isSearchShortcut', () => {
  it('matches Ctrl+Shift+F and ⌘⇧F, case-insensitively', () => {
    expect(isSearchShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'f' })).toBe(
      true
    );
    expect(isSearchShortcut({ ctrlKey: false, metaKey: true, shiftKey: true, key: 'F' })).toBe(
      true
    );
  });

  it('requires Shift to be held', () => {
    expect(isSearchShortcut({ ctrlKey: true, metaKey: false, shiftKey: false, key: 'f' })).toBe(
      false
    );
  });

  it('ignores wrong keys', () => {
    expect(isSearchShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'g' })).toBe(
      false
    );
  });
});
