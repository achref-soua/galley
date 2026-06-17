import { describe, it, expect } from 'vitest';
import { systemClock, formatDuration, compileTiming } from '../src/lib/timing';

describe('systemClock', () => {
  it('reports a numeric time that does not go backwards', () => {
    const clock = systemClock();
    const first = clock.now();
    const second = clock.now();
    expect(typeof first).toBe('number');
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

describe('formatDuration', () => {
  it('shows sub-second builds in milliseconds', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(419.6)).toBe('420 ms');
    expect(formatDuration(999)).toBe('999 ms');
  });

  it('shows one second or more in seconds with two decimals', () => {
    expect(formatDuration(1000)).toBe('1.00 s');
    expect(formatDuration(1337)).toBe('1.34 s');
  });
});

describe('compileTiming', () => {
  it('is blank before the first build', () => {
    expect(compileTiming(null, false)).toBe('');
  });

  it('says "cached" for a cache hit regardless of duration', () => {
    expect(compileTiming(0, true)).toBe('cached');
  });

  it('shows the formatted duration for a fresh build', () => {
    expect(compileTiming(420, false)).toBe('420 ms');
  });
});
