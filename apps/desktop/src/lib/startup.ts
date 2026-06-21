/**
 * Cold-start helpers (master plan §8.2). {@link once} memoizes an expensive
 * loader so heavy modules are constructed at most once, and {@link deferIdle}
 * pushes non-critical work past the first paint so the window is interactive
 * fast on low-spec machines.
 */

/** Wrap `loader` so it runs once; later calls return the cached value. */
export function once<T>(loader: () => T): () => T {
  let cached: { value: T } | null = null;
  return () => {
    if (cached === null) {
      cached = { value: loader() };
    }
    return cached.value;
  };
}

/** Schedules a single one-shot idle callback. */
export type IdleSchedule = (task: () => void) => void;

/** The host idle/timer functions, narrowed so a fake is easy to supply. */
interface IdleHost {
  requestIdleCallback?: (callback: () => void) => number;
  setTimeout: (handler: () => void, timeout: number) => number;
}

/**
 * Resolve the best idle scheduler from `host`: `requestIdleCallback` when the
 * platform offers it, otherwise a near-immediate `setTimeout` fallback.
 */
export function idleSchedule(host: IdleHost = window): IdleSchedule {
  const ric = host.requestIdleCallback;
  if (ric) {
    return (task) => void ric.call(host, task);
  }
  return (task) => void host.setTimeout(task, 1);
}

/** Run `task` once the UI is idle, using `schedule` (defaults to the window's). */
export function deferIdle(task: () => void, schedule: IdleSchedule = idleSchedule()): void {
  schedule(task);
}
