/**
 * The app layout model — pure.
 *
 * Galley's workspace is three panes: sidebar | editor | preview. The sidebar
 * and preview hold explicit widths; the editor flexes to fill the rest. Drag
 * handles and persistence in the desktop app are thin wrappers over these
 * functions, so the clamping and collapse rules are fully unit-tested without a
 * DOM.
 */

/** Widths (px) and collapse flags for the side panes. */
export interface LayoutState {
  sidebarWidth: number;
  previewWidth: number;
  sidebarCollapsed: boolean;
  previewCollapsed: boolean;
}

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 520;
export const PREVIEW_MIN = 240;
export const PREVIEW_MAX = 960;

export const DEFAULT_LAYOUT: LayoutState = {
  sidebarWidth: 264,
  previewWidth: 480,
  sidebarCollapsed: false,
  previewCollapsed: false
};

/** Clamp a number into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/** Set the sidebar width, clamped to its bounds. */
export function setSidebarWidth(state: LayoutState, width: number): LayoutState {
  return { ...state, sidebarWidth: clamp(Math.round(width), SIDEBAR_MIN, SIDEBAR_MAX) };
}

/** Set the preview width, clamped to its bounds. */
export function setPreviewWidth(state: LayoutState, width: number): LayoutState {
  return { ...state, previewWidth: clamp(Math.round(width), PREVIEW_MIN, PREVIEW_MAX) };
}

/** Show/hide the sidebar. */
export function toggleSidebar(state: LayoutState): LayoutState {
  return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
}

/** Show/hide the preview. */
export function togglePreview(state: LayoutState): LayoutState {
  return { ...state, previewCollapsed: !state.previewCollapsed };
}

/** Serialise layout state for persistence. */
export function serializeLayout(state: LayoutState): string {
  return JSON.stringify(state);
}

function isLayoutShape(value: unknown): value is LayoutState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.sidebarWidth === 'number' &&
    typeof v.previewWidth === 'number' &&
    typeof v.sidebarCollapsed === 'boolean' &&
    typeof v.previewCollapsed === 'boolean'
  );
}

/**
 * Parse persisted layout state, re-clamping widths and falling back to the
 * default for anything missing or malformed.
 */
export function parseLayout(raw: string | null): LayoutState {
  if (raw === null) {
    return { ...DEFAULT_LAYOUT };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
  if (!isLayoutShape(parsed)) {
    return { ...DEFAULT_LAYOUT };
  }
  return {
    sidebarWidth: clamp(Math.round(parsed.sidebarWidth), SIDEBAR_MIN, SIDEBAR_MAX),
    previewWidth: clamp(Math.round(parsed.previewWidth), PREVIEW_MIN, PREVIEW_MAX),
    sidebarCollapsed: parsed.sidebarCollapsed,
    previewCollapsed: parsed.previewCollapsed
  };
}
