/**
 * Pure helpers for version-history: line-level diff and change stats.
 *
 * No I/O — all functions take strings and return data structures. The diff
 * algorithm mirrors the LCS approach in galley-core so both sides produce
 * consistent results. Tests live in tests/vcs.test.ts at 100% coverage.
 */

/** Whether a line was added, removed, or unchanged. */
export type DiffKind = 'added' | 'removed' | 'context';

/** A single line of a unified diff. */
export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/** A single entry in the checkpoint timeline. */
export interface SnapshotEntry {
  id: string;
  name: string;
  date: string;
  isNamed: boolean;
  linesAdded: number;
  linesRemoved: number;
}

/** Produce a line-level diff between `oldContent` and `newContent`. */
export function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const a = oldContent === '' ? [] : oldContent.split('\n');
  const b = newContent === '' ? [] : newContent.split('\n');

  if (a.length === 0 && b.length === 0) {
    return [];
  }

  const dp = lcsTable(a, b);
  const result: DiffLine[] = [];
  emitDiff(a, b, a.length, b.length, dp, result);
  return result;
}

/** Count lines added and removed going from `oldContent` to `newContent`. */
export function diffStats(
  oldContent: string,
  newContent: string
): { linesAdded: number; linesRemoved: number } {
  const diff = computeDiff(oldContent, newContent);
  const linesAdded = diff.filter((d) => d.kind === 'added').length;
  const linesRemoved = diff.filter((d) => d.kind === 'removed').length;
  return { linesAdded, linesRemoved };
}

// Build the LCS length table.
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        dp[i][j] = dp[i - 1][j];
      } else {
        dp[i][j] = dp[i][j - 1];
      }
    }
  }
  return dp;
}

// Recursive LCS back-tracking to emit diff lines.
function emitDiff(
  a: string[],
  b: string[],
  i: number,
  j: number,
  dp: number[][],
  out: DiffLine[]
): void {
  if (i === 0 && j === 0) {
    return;
  }
  if (i === 0) {
    emitDiff(a, b, 0, j - 1, dp, out);
    out.push({ kind: 'added', text: b[j - 1] });
  } else if (j === 0) {
    emitDiff(a, b, i - 1, 0, dp, out);
    out.push({ kind: 'removed', text: a[i - 1] });
  } else if (a[i - 1] === b[j - 1]) {
    emitDiff(a, b, i - 1, j - 1, dp, out);
    out.push({ kind: 'context', text: a[i - 1] });
  } else if (dp[i - 1][j] >= dp[i][j - 1]) {
    emitDiff(a, b, i - 1, j, dp, out);
    out.push({ kind: 'removed', text: a[i - 1] });
  } else {
    emitDiff(a, b, i, j - 1, dp, out);
    out.push({ kind: 'added', text: b[j - 1] });
  }
}
