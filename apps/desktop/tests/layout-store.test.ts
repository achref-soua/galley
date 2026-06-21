import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_LAYOUT, SIDEBAR_MAX, PREVIEW_MIN, BOTTOM_MAX } from '@galley/ui-kit';
import { LayoutController, LAYOUT_STORAGE_KEY } from '../src/lib/layout-store';

function makeStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) {
    map.set(LAYOUT_STORAGE_KEY, initial);
  }
  return {
    map,
    storage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value)
    }
  };
}

describe('LayoutController', () => {
  it('starts from the default layout when storage is empty', () => {
    const c = new LayoutController(makeStorage().storage);
    expect(c.state).toEqual(DEFAULT_LAYOUT);
  });

  it('restores a persisted layout', () => {
    const { storage } = makeStorage(
      JSON.stringify({
        sidebarWidth: 300,
        previewWidth: 520,
        sidebarCollapsed: true,
        previewCollapsed: false
      })
    );
    const c = new LayoutController(storage);
    expect(c.state.sidebarWidth).toBe(300);
    expect(c.state.sidebarCollapsed).toBe(true);
  });

  it('clamps, persists, and notifies on a width change', () => {
    const { storage, map } = makeStorage();
    const c = new LayoutController(storage);
    const seen = vi.fn();
    c.subscribe(seen);

    c.setSidebarWidth(9999);
    expect(c.state.sidebarWidth).toBe(SIDEBAR_MAX);
    expect(seen).toHaveBeenLastCalledWith(c.state);
    expect(JSON.parse(map.get(LAYOUT_STORAGE_KEY)!).sidebarWidth).toBe(SIDEBAR_MAX);

    c.setPreviewWidth(10);
    expect(c.state.previewWidth).toBe(PREVIEW_MIN);
  });

  it('clamps and persists the bottom panel height', () => {
    const { storage, map } = makeStorage();
    const c = new LayoutController(storage);
    const seen = vi.fn();
    c.subscribe(seen);

    c.setBottomPanelHeight(9999);
    expect(c.state.bottomPanelHeight).toBe(BOTTOM_MAX);
    expect(seen).toHaveBeenLastCalledWith(c.state);
    expect(JSON.parse(map.get(LAYOUT_STORAGE_KEY)!).bottomPanelHeight).toBe(BOTTOM_MAX);
  });

  it('toggles the collapse flags', () => {
    const c = new LayoutController(makeStorage().storage);
    c.toggleSidebar();
    expect(c.state.sidebarCollapsed).toBe(true);
    c.togglePreview();
    expect(c.state.previewCollapsed).toBe(true);
  });

  it('resets to the default layout', () => {
    const c = new LayoutController(makeStorage().storage);
    c.toggleSidebar();
    c.reset();
    expect(c.state).toEqual(DEFAULT_LAYOUT);
  });

  it('stops notifying after unsubscribe', () => {
    const c = new LayoutController(makeStorage().storage);
    const seen = vi.fn();
    const off = c.subscribe(seen);
    off();
    c.toggleSidebar();
    expect(seen).not.toHaveBeenCalled();
  });
});
