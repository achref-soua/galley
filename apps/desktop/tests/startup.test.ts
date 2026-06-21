import { describe, it, expect, vi } from 'vitest';
import { once, idleSchedule, deferIdle } from '../src/lib/startup';

describe('startup — once', () => {
  it('runs the loader at most once and caches the value', () => {
    const loader = vi.fn(() => ({ heavy: true }));
    const get = once(loader);
    const a = get();
    const b = get();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});

describe('startup — idleSchedule', () => {
  it('prefers requestIdleCallback when present', () => {
    const ric = vi.fn((cb: () => void) => {
      cb();
      return 1;
    });
    const setTimeout = vi.fn(() => 2);
    const task = vi.fn();
    idleSchedule({ requestIdleCallback: ric, setTimeout })(task);
    expect(ric).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('falls back to setTimeout when idle callbacks are unavailable', () => {
    const setTimeout = vi.fn((handler: () => void) => {
      handler();
      return 2;
    });
    const task = vi.fn();
    idleSchedule({ setTimeout })(task);
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe('startup — deferIdle', () => {
  it('runs the task through the supplied schedule', () => {
    const task = vi.fn();
    const schedule = vi.fn((t: () => void) => t());
    deferIdle(task, schedule);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('uses the default window schedule when none is supplied', () => {
    const win = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
    win.requestIdleCallback = (cb) => {
      cb();
      return 0;
    };
    const task = vi.fn();
    deferIdle(task);
    expect(task).toHaveBeenCalledTimes(1);
    delete win.requestIdleCallback;
  });
});
