/** Keyboard-shortcut predicates, kept pure so they test without the DOM. */

/** The subset of a keyboard event the shortcuts care about. */
export interface KeyChord {
  ctrlKey: boolean;
  metaKey: boolean;
  key: string;
}

/** Whether an event is the "save" shortcut (Ctrl+S or ⌘S). */
export function isSaveShortcut(event: KeyChord): boolean {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
}

/** Whether an event is the "compile" shortcut (Ctrl+B or ⌘B). */
export function isCompileShortcut(event: KeyChord): boolean {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b';
}

/** Whether an event is the "command palette" shortcut (Ctrl+Shift+P or ⌘⇧P). */
export function isCommandPaletteShortcut(event: KeyChord & { shiftKey: boolean }): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p';
}

/** Whether an event is the "find in project" shortcut (Ctrl+Shift+F or ⌘⇧F). */
export function isSearchShortcut(event: KeyChord & { shiftKey: boolean }): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f';
}
