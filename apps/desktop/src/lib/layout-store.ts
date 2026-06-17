import {
  type LayoutState,
  DEFAULT_LAYOUT,
  parseLayout,
  serializeLayout,
  setSidebarWidth,
  setPreviewWidth,
  toggleSidebar,
  togglePreview
} from '@galley/ui-kit';

export const LAYOUT_STORAGE_KEY = 'galley:layout';

/**
 * Holds the workspace layout (pane widths + collapse flags), persists every
 * change, and notifies subscribers. The clamping rules live in the pure
 * `@galley/ui-kit` layout model; this class only adds persistence and change
 * notification, so it stays trivial to test with an injected `Storage`.
 */
export class LayoutController {
  #storage: Pick<Storage, 'getItem' | 'setItem'>;
  #state: LayoutState;
  #listeners = new Set<(state: LayoutState) => void>();

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.#storage = storage;
    this.#state = parseLayout(storage.getItem(LAYOUT_STORAGE_KEY));
  }

  get state(): LayoutState {
    return this.#state;
  }

  #commit(next: LayoutState): void {
    this.#state = next;
    this.#storage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(next));
    for (const listener of this.#listeners) {
      listener(next);
    }
  }

  setSidebarWidth(width: number): void {
    this.#commit(setSidebarWidth(this.#state, width));
  }

  setPreviewWidth(width: number): void {
    this.#commit(setPreviewWidth(this.#state, width));
  }

  toggleSidebar(): void {
    this.#commit(toggleSidebar(this.#state));
  }

  togglePreview(): void {
    this.#commit(togglePreview(this.#state));
  }

  /** Reset to the shipped default layout. */
  reset(): void {
    this.#commit({ ...DEFAULT_LAYOUT });
  }

  subscribe(listener: (state: LayoutState) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
