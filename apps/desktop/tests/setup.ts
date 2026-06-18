import { beforeEach } from 'vitest';
import type { EditorFactory } from '../src/lib/editor';

/** A fake editor factory backed by a plain `<textarea aria-label="Source">`, so
 *  integration tests can drive the editing surface without CodeMirror (which is
 *  covered directly in `editor.test.ts` and exercised by the Playwright e2e). */
export function fakeEditorFactory(): EditorFactory {
  return ({ parent, doc, onChange, onscroll }) => {
    const area = document.createElement('textarea');
    area.setAttribute('aria-label', 'Source');
    area.value = doc;
    area.addEventListener('input', () => onChange(area.value));
    parent.appendChild(area);
    if (onscroll !== undefined) onscroll(0);
    return {
      setDoc(value) {
        if (value !== area.value) {
          area.value = value;
        }
      },
      setDiagnostics() {},
      gotoLine() {},
      currentLine() { return 1; },
      setKeymapMode() {},
      setSpellChecker() {},
      destroy() {
        area.remove();
      }
    };
  };
}

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
