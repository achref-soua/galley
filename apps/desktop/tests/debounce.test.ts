import { describe, it, expect, vi } from 'vitest';
import { windowTimer } from '../src/lib/debounce';

/** A controllable timer host: records scheduling and lets a test fire the
 *  pending callback by hand. */
class FakeHost {
  pending: (() => void) | null = null;
  lastDelay = 0;
  nextHandle = 1;
  cleared: number[] = [];

  setTimeout(handler: () => void, timeout: number): number {
    this.pending = handler;
    this.lastDelay = timeout;
    return this.nextHandle++;
  }

  clearTimeout(handle: number): void {
    this.cleared.push(handle);
  }

  /** Run the pending callback as the real `setTimeout` eventually would. */
  fire(): void {
    const run = this.pending;
    this.pending = null;
    run?.();
  }
}

describe('windowTimer', () => {
  it('schedules a callback and runs it when fired', () => {
    const host = new FakeHost();
    const timer = windowTimer(host);
    const callback = vi.fn();
    timer.set(callback, 400);
    expect(host.lastDelay).toBe(400);
    expect(callback).not.toHaveBeenCalled();
    host.fire();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('replaces a pending callback so only the last one in a burst runs', () => {
    const host = new FakeHost();
    const timer = windowTimer(host);
    const first = vi.fn();
    const second = vi.fn();
    timer.set(first, 400);
    timer.set(second, 400); // cancels the first
    expect(host.cleared).toEqual([1]);
    host.fire();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('cancels a pending callback on clear, and clear is a no-op when idle', () => {
    const host = new FakeHost();
    const timer = windowTimer(host);
    timer.clear(); // nothing pending → no clearTimeout
    expect(host.cleared).toEqual([]);
    timer.set(vi.fn(), 400);
    timer.clear(); // pending → clears
    expect(host.cleared).toEqual([1]);
  });

  it('forgets the handle after firing so a later clear does nothing', () => {
    const host = new FakeHost();
    const timer = windowTimer(host);
    timer.set(vi.fn(), 400);
    host.fire();
    timer.clear(); // handle was reset to null on fire
    expect(host.cleared).toEqual([]);
  });

  it('defaults to the real window timer', () => {
    // Exercises the default `host = window` parameter without leaving a real
    // pending timeout: schedule, then immediately cancel it.
    const timer = windowTimer();
    timer.set(vi.fn(), 1000);
    timer.clear();
    expect(true).toBe(true);
  });
});
