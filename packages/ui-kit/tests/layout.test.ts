import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYOUT,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  PREVIEW_MIN,
  PREVIEW_MAX,
  BOTTOM_MIN,
  BOTTOM_MAX,
  clamp,
  setSidebarWidth,
  setPreviewWidth,
  setBottomPanelHeight,
  toggleSidebar,
  togglePreview,
  serializeLayout,
  parseLayout,
  type LayoutState
} from '../src/layout';

describe('clamp', () => {
  it('returns the value when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to the minimum', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it('clamps to the maximum', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('setSidebarWidth', () => {
  it('rounds and keeps a width within bounds', () => {
    expect(setSidebarWidth(DEFAULT_LAYOUT, 300.4).sidebarWidth).toBe(300);
  });

  it('clamps below the minimum and above the maximum', () => {
    expect(setSidebarWidth(DEFAULT_LAYOUT, 10).sidebarWidth).toBe(SIDEBAR_MIN);
    expect(setSidebarWidth(DEFAULT_LAYOUT, 9999).sidebarWidth).toBe(SIDEBAR_MAX);
  });
});

describe('setPreviewWidth', () => {
  it('clamps below the minimum and above the maximum', () => {
    expect(setPreviewWidth(DEFAULT_LAYOUT, 10).previewWidth).toBe(PREVIEW_MIN);
    expect(setPreviewWidth(DEFAULT_LAYOUT, 9999).previewWidth).toBe(PREVIEW_MAX);
  });
});

describe('setBottomPanelHeight', () => {
  it('rounds and keeps a height within bounds', () => {
    expect(setBottomPanelHeight(DEFAULT_LAYOUT, 300.6).bottomPanelHeight).toBe(301);
  });

  it('clamps below the minimum and above the maximum', () => {
    expect(setBottomPanelHeight(DEFAULT_LAYOUT, 10).bottomPanelHeight).toBe(BOTTOM_MIN);
    expect(setBottomPanelHeight(DEFAULT_LAYOUT, 9999).bottomPanelHeight).toBe(BOTTOM_MAX);
  });

  it('leaves the other panes untouched', () => {
    const next = setBottomPanelHeight(DEFAULT_LAYOUT, 320);
    expect(next.sidebarWidth).toBe(DEFAULT_LAYOUT.sidebarWidth);
    expect(next.previewWidth).toBe(DEFAULT_LAYOUT.previewWidth);
  });
});

describe('collapse toggles', () => {
  it('flips the sidebar flag without touching the preview', () => {
    const next = toggleSidebar(DEFAULT_LAYOUT);
    expect(next.sidebarCollapsed).toBe(true);
    expect(next.previewCollapsed).toBe(false);
  });

  it('flips the preview flag', () => {
    expect(togglePreview(DEFAULT_LAYOUT).previewCollapsed).toBe(true);
  });
});

describe('serialize / parse round-trip', () => {
  it('restores a serialised layout, re-clamping widths', () => {
    const state: LayoutState = {
      sidebarWidth: 320,
      previewWidth: 500,
      bottomPanelHeight: 300,
      sidebarCollapsed: true,
      previewCollapsed: false
    };
    expect(parseLayout(serializeLayout(state))).toEqual(state);
  });

  it('re-clamps out-of-range stored widths and bottom height', () => {
    const restored = parseLayout(
      JSON.stringify({
        sidebarWidth: 5000,
        previewWidth: 10,
        bottomPanelHeight: 5000,
        sidebarCollapsed: false,
        previewCollapsed: true
      })
    );
    expect(restored.sidebarWidth).toBe(SIDEBAR_MAX);
    expect(restored.previewWidth).toBe(PREVIEW_MIN);
    expect(restored.bottomPanelHeight).toBe(BOTTOM_MAX);
  });

  it('defaults the bottom height for a layout persisted before it existed', () => {
    // A legacy layout (no bottomPanelHeight) is still valid: keep its widths and
    // fall back to the default dock height rather than discarding the whole thing.
    const restored = parseLayout(
      JSON.stringify({
        sidebarWidth: 300,
        previewWidth: 460,
        sidebarCollapsed: false,
        previewCollapsed: false
      })
    );
    expect(restored.sidebarWidth).toBe(300);
    expect(restored.bottomPanelHeight).toBe(DEFAULT_LAYOUT.bottomPanelHeight);
  });

  it('defaults the bottom height when the stored value is not a number', () => {
    const restored = parseLayout(
      JSON.stringify({
        sidebarWidth: 300,
        previewWidth: 460,
        bottomPanelHeight: 'tall',
        sidebarCollapsed: false,
        previewCollapsed: false
      })
    );
    expect(restored.bottomPanelHeight).toBe(DEFAULT_LAYOUT.bottomPanelHeight);
  });
});

describe('parseLayout fallbacks', () => {
  it('returns the default for null', () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it('returns the default for invalid JSON', () => {
    expect(parseLayout('{not json')).toEqual(DEFAULT_LAYOUT);
  });

  it('returns the default for a non-object', () => {
    expect(parseLayout('123')).toEqual(DEFAULT_LAYOUT);
  });

  it('returns the default for null JSON', () => {
    expect(parseLayout('null')).toEqual(DEFAULT_LAYOUT);
  });

  it('rejects each malformed field', () => {
    const base = {
      sidebarWidth: 264,
      previewWidth: 480,
      sidebarCollapsed: false,
      previewCollapsed: false
    };
    expect(parseLayout(JSON.stringify({ ...base, sidebarWidth: '1' }))).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout(JSON.stringify({ ...base, previewWidth: '1' }))).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout(JSON.stringify({ ...base, sidebarCollapsed: 'no' }))).toEqual(
      DEFAULT_LAYOUT
    );
    expect(parseLayout(JSON.stringify({ ...base, previewCollapsed: 'no' }))).toEqual(
      DEFAULT_LAYOUT
    );
  });

  it('returns a fresh default object each call', () => {
    const a = parseLayout(null);
    a.sidebarWidth = 1;
    expect(parseLayout(null).sidebarWidth).toBe(DEFAULT_LAYOUT.sidebarWidth);
  });
});
