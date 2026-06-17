import { beforeEach } from 'vitest';

/** Dispatch a pointer event carrying `clientX` (jsdom drops it from
 *  `fireEvent`'s synthetic pointer events). */
export function firePointer(type: string, target: EventTarget, clientX: number): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'clientX', { value: clientX });
  target.dispatchEvent(event);
}

/** A minimal `matchMedia` stub (jsdom ships none). Tests override `matches`
 *  by reassigning `window.matchMedia` where they need dark / reduced-motion. */
export function stubMatchMedia(matches = false): typeof window.matchMedia {
  return ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia = stubMatchMedia(false);
  document.documentElement.removeAttribute('data-theme');
});
