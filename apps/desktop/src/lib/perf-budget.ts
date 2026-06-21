/**
 * Performance budgets for the low-spec reference machine (master plan §8.2),
 * mirrored on the frontend so the UI bundle-size gate and the adaptive
 * auto-compile debounce share one source of truth with `galley-core::perf`.
 */

/** The performance budgets Galley commits to on the reference machine. */
export interface PerfBudget {
  /** Cold start to interactive, in milliseconds. */
  coldStartMs: number;
  /** Idle resident memory including a warm engine, in mebibytes. */
  idleRamMb: number;
  /** Cached single-edit recompile of a medium document, in milliseconds. */
  recompileMs: number;
  /** UI interaction frame budget, in milliseconds. */
  frameMs: number;
  /** Shipped UI bundle size (gzipped JS + CSS), in kibibytes. */
  bundleKib: number;
}

/** The budgets from master plan §8.2 — identical to `PerfBudget::REFERENCE`. */
export const REFERENCE_BUDGET: PerfBudget = {
  coldStartMs: 2500,
  idleRamMb: 150,
  recompileMs: 1000,
  frameMs: 16,
  bundleKib: 1536
};

/** Smallest auto-compile debounce, in milliseconds, for a tiny document. */
export const MIN_DEBOUNCE_MS = 250;
/** Largest auto-compile debounce, in milliseconds, for a very large document. */
export const MAX_DEBOUNCE_MS = 1500;
/** Document bytes that add one millisecond of debounce beyond the minimum. */
export const DEBOUNCE_BYTES_PER_MS = 512;

/**
 * Scale the auto-compile debounce to document size. Small documents recompile
 * almost immediately; large ones wait longer so a burst of keystrokes coalesces
 * into a single build. Clamped to `[MIN_DEBOUNCE_MS, MAX_DEBOUNCE_MS]`.
 */
export function adaptiveDebounceMs(docBytes: number): number {
  const extra = Math.floor(docBytes / DEBOUNCE_BYTES_PER_MS);
  const target = MIN_DEBOUNCE_MS + extra;
  return target > MAX_DEBOUNCE_MS ? MAX_DEBOUNCE_MS : target;
}

/** One built asset's file name and on-disk (gzipped) size, in bytes. */
export interface BundleEntry {
  /** The asset's file name. */
  name: string;
  /** The asset's gzipped size, in bytes. */
  bytes: number;
}

/** The outcome of measuring the built bundle against its budget. */
export interface BundleResult {
  /** Total gzipped size of the counted assets, in bytes. */
  totalBytes: number;
  /** The budget in bytes that was applied. */
  budgetBytes: number;
  /** Whether the total is within budget. */
  ok: boolean;
  /** Bytes over budget (`0` when within budget). */
  overageBytes: number;
}

/** Only shipped JS and CSS count toward the bundle budget. */
export function countsTowardBudget(name: string): boolean {
  return name.endsWith('.js') || name.endsWith('.css');
}

/** Sum the JS/CSS entries and classify them against `budgetKib`. */
export function evaluateBundle(entries: BundleEntry[], budgetKib: number): BundleResult {
  const budgetBytes = budgetKib * 1024;
  let totalBytes = 0;
  for (const entry of entries) {
    if (countsTowardBudget(entry.name)) {
      totalBytes += entry.bytes;
    }
  }
  const overageBytes = totalBytes > budgetBytes ? totalBytes - budgetBytes : 0;
  return { totalBytes, budgetBytes, ok: overageBytes === 0, overageBytes };
}
