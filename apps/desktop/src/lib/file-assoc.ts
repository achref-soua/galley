/**
 * File-association helpers (master plan §4.8). Decide whether an OS-opened path
 * is something Galley edits — a `.tex` source or a `.galley` project manifest —
 * so the shell can route a double-clicked file to the right action. Pure.
 */

/** The kind of file Galley can open directly. */
export type OpenableKind = 'tex' | 'galley';

/** Classify a path by extension (case-insensitive); `null` if unsupported. */
export function classifyOpenable(path: string): OpenableKind | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tex')) {
    return 'tex';
  }
  if (lower.endsWith('.galley')) {
    return 'galley';
  }
  return null;
}

/** Whether Galley registers and can open this path's file type. */
export function isGalleyOpenable(path: string): boolean {
  return classifyOpenable(path) !== null;
}
