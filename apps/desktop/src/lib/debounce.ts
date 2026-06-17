/**
 * A single-slot debounce timer behind a small {@link Timer} seam.
 *
 * Auto-compile must not fire on every keystroke; it waits until typing pauses.
 * The controller drives a {@link Timer}: each {@link Timer.set} replaces any
 * pending callback, so only the last one in a burst runs. The real timer is a
 * thin wrapper over `setTimeout`/`clearTimeout`; tests inject a fake they can
 * fire by hand, keeping the debounce decision logic deterministic.
 */

/** Schedules a single pending callback, replacing any previous one. */
export interface Timer {
  /** Schedule `callback` after `delayMs`, cancelling any pending callback. */
  set(callback: () => void, delayMs: number): void;
  /** Cancel any pending callback. */
  clear(): void;
}

/** The host timer functions, narrowed so a fake `host` is easy to supply. */
interface TimerHost {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(handle: number): void;
}

/** The real timer, backed by the window's `setTimeout`/`clearTimeout`. */
export function windowTimer(host: TimerHost = window): Timer {
  let handle: number | null = null;
  return {
    set(callback, delayMs) {
      if (handle !== null) {
        host.clearTimeout(handle);
      }
      handle = host.setTimeout(() => {
        handle = null;
        callback();
      }, delayMs);
    },
    clear() {
      if (handle !== null) {
        host.clearTimeout(handle);
        handle = null;
      }
    }
  };
}
