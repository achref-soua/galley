/**
 * Timing helpers for compilation: a small {@link Clock} seam (so the controller
 * can measure build duration with an injectable, deterministic clock in tests)
 * and the formatting used to show that duration in the UI.
 */

/** A monotonic source of milliseconds. */
export interface Clock {
  /** The current time in milliseconds. */
  now(): number;
}

/** The real clock, backed by the high-resolution `performance` timer. */
export function systemClock(): Clock {
  return { now: () => performance.now() };
}

/** Format a build duration for display, e.g. `420 ms` or `1.34 s`. */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * The compile-timing label shown next to the status: nothing before the first
 * build, `cached` when the result came straight from the cache, otherwise the
 * formatted build duration.
 */
export function compileTiming(durationMs: number | null, cached: boolean): string {
  if (durationMs === null) {
    return '';
  }
  if (cached) {
    return 'cached';
  }
  return formatDuration(durationMs);
}
