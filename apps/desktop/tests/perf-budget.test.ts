import { describe, it, expect } from 'vitest';
import {
  REFERENCE_BUDGET,
  MIN_DEBOUNCE_MS,
  MAX_DEBOUNCE_MS,
  DEBOUNCE_BYTES_PER_MS,
  adaptiveDebounceMs,
  countsTowardBudget,
  evaluateBundle
} from '../src/lib/perf-budget';

describe('perf-budget — reference budget', () => {
  it('matches the master-plan §8.2 numbers', () => {
    expect(REFERENCE_BUDGET).toEqual({
      coldStartMs: 2500,
      idleRamMb: 150,
      recompileMs: 1000,
      frameMs: 16,
      bundleKib: 1536
    });
  });
});

describe('perf-budget — adaptiveDebounceMs', () => {
  it('floors at the minimum for tiny documents', () => {
    expect(adaptiveDebounceMs(0)).toBe(MIN_DEBOUNCE_MS);
    expect(adaptiveDebounceMs(DEBOUNCE_BYTES_PER_MS - 1)).toBe(MIN_DEBOUNCE_MS);
  });

  it('scales linearly with size', () => {
    expect(adaptiveDebounceMs(DEBOUNCE_BYTES_PER_MS)).toBe(MIN_DEBOUNCE_MS + 1);
    expect(adaptiveDebounceMs(DEBOUNCE_BYTES_PER_MS * 100)).toBe(MIN_DEBOUNCE_MS + 100);
  });

  it('clamps at the ceiling for very large documents', () => {
    expect(adaptiveDebounceMs(Number.MAX_SAFE_INTEGER)).toBe(MAX_DEBOUNCE_MS);
  });
});

describe('perf-budget — countsTowardBudget', () => {
  it('counts JS and CSS, ignores everything else', () => {
    expect(countsTowardBudget('index.js')).toBe(true);
    expect(countsTowardBudget('style.css')).toBe(true);
    expect(countsTowardBudget('index.js.map')).toBe(false);
    expect(countsTowardBudget('logo.svg')).toBe(false);
  });
});

describe('perf-budget — evaluateBundle', () => {
  it('sums only JS/CSS and passes within budget', () => {
    const result = evaluateBundle(
      [
        { name: 'app.js', bytes: 200 * 1024 },
        { name: 'app.css', bytes: 50 * 1024 },
        { name: 'app.js.map', bytes: 900 * 1024 },
        { name: 'logo.png', bytes: 900 * 1024 }
      ],
      1536
    );
    expect(result.totalBytes).toBe(250 * 1024);
    expect(result.budgetBytes).toBe(1536 * 1024);
    expect(result.ok).toBe(true);
    expect(result.overageBytes).toBe(0);
  });

  it('reports an overage when over budget', () => {
    const result = evaluateBundle([{ name: 'huge.js', bytes: 2048 * 1024 }], 1024);
    expect(result.ok).toBe(false);
    expect(result.overageBytes).toBe(1024 * 1024);
  });
});
