/**
 * Command palette: an action registry with fuzzy filtering.
 *
 * All logic here is pure and dependency-free. The Svelte component is a thin
 * overlay that renders the filtered list and calls {@link PaletteAction.run}.
 */

/** A single action in the command palette. */
export interface PaletteAction {
  /** Stable unique identifier. */
  id: string;
  /** Display label shown in the palette. */
  label: string;
  /** Optional keyboard shortcut hint (display only). */
  shortcut?: string;
  /** Execute the action. */
  run(): void;
}

/**
 * Filter `actions` to those whose `label` matches `query` (case-insensitive
 * subsequence match). An empty query returns all actions unchanged.
 */
export function filterActions(query: string, actions: PaletteAction[]): PaletteAction[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return actions;
  }
  return actions.filter((a) => subsequenceMatch(q, a.label.toLowerCase()));
}

/**
 * Returns true when every character of `needle` appears in `haystack` in order
 * (case-insensitive subsequence / fuzzy search).
 */
export function subsequenceMatch(needle: string, haystack: string): boolean {
  let hi = 0;
  for (let ni = 0; ni < needle.length; ni += 1) {
    const found = haystack.indexOf(needle[ni], hi);
    if (found === -1) {
      return false;
    }
    hi = found + 1;
  }
  return true;
}
