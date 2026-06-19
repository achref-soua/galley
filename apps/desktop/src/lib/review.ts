/**
 * Pure, I/O-free helpers for the track-changes review queue.
 *
 * A ReviewEntry records a proposed source change — the byte range that was
 * modified, the original text, and the replacement text — so it can be
 * accepted (kept as-is) or rejected (reverted).  All functions here operate on
 * plain data and return new values; nothing mutates in place.
 */

/**
 * A single proposed change waiting for the author's decision.
 */
export interface ReviewEntry {
  readonly id: string;
  /** Start offset of the changed range in the current (post-edit) source. */
  readonly from: number;
  /** End offset of the changed range in the current source (exclusive). */
  readonly to: number;
  /** Original text that was at `[from, to)` before the edit. */
  readonly before: string;
  /** Replacement text that is now at `[from, to)`. */
  readonly after: string;
}

/**
 * Construct a {@link ReviewEntry}.  The `id` must be unique within the queue;
 * callers are responsible for supplying a stable identifier (e.g., a
 * monotonic counter converted to a string).
 */
export function createReviewEntry(
  id: string,
  from: number,
  to: number,
  before: string,
  after: string
): ReviewEntry {
  return { id, from, to, before, after };
}

/**
 * Return a new source string with `entry`'s change reverted: the `after` text
 * at `[from, to)` is replaced by the original `before` text.
 */
export function applyReject(src: string, entry: ReviewEntry): string {
  return src.slice(0, entry.from) + entry.before + src.slice(entry.to);
}

/**
 * Return a new entries array with the entry identified by `id` removed
 * (accepted — the change is kept in the source unchanged).
 */
export function acceptEntries(entries: ReviewEntry[], id: string): ReviewEntry[] {
  return entries.filter((e) => e.id !== id);
}

/**
 * Return the entries array and source string after rejecting the entry
 * identified by `id`: the source change is reverted via {@link applyReject}
 * and the entry is removed from the queue.
 *
 * When no entry with `id` exists the inputs are returned unchanged.
 */
export function rejectEntries(
  entries: ReviewEntry[],
  id: string,
  src: string
): { entries: ReviewEntry[]; src: string } {
  const entry = entries.find((e) => e.id === id);
  if (entry === undefined) return { entries, src };
  return {
    entries: entries.filter((e) => e.id !== id),
    src: applyReject(src, entry)
  };
}

/**
 * Return the number of entries in the queue (all entries are pending by
 * definition — accepted/rejected ones have been removed).
 */
export function pendingCount(entries: ReviewEntry[]): number {
  return entries.length;
}
