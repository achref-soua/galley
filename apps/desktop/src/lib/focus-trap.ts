/**
 * Keyboard focus-trap math (pure). Given how many focusable elements a modal
 * has and which one holds focus, decide where Tab / Shift+Tab should land so
 * focus wraps inside the modal instead of escaping to the page behind it. The
 * component performs the actual `focus()`; this stays testable.
 */

/**
 * The index to focus next when Tab (`shift = false`) or Shift+Tab
 * (`shift = true`) is pressed. Wraps around the ends. Returns `-1` when there is
 * nothing focusable.
 */
export function nextFocusIndex(count: number, current: number, shift: boolean): number {
  if (count <= 0) {
    return -1;
  }
  if (shift) {
    return current <= 0 ? count - 1 : current - 1;
  }
  return current >= count - 1 ? 0 : current + 1;
}
