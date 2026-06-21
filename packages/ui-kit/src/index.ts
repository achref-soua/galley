/**
 * @galley/ui-kit — Galley's design system.
 *
 * The typewriter design tokens and themes ship as CSS (`@galley/ui-kit/styles.css`);
 * this entry point exports the shared Svelte primitives plus the pure helpers
 * for theming, layout, and contrast.
 */
export { default as Logo } from './Logo.svelte';
export { default as Wordmark } from './Wordmark.svelte';
export { default as Button } from './Button.svelte';
export { default as IconButton } from './IconButton.svelte';
export { default as Toggle } from './Toggle.svelte';
export { default as SegmentedControl } from './SegmentedControl.svelte';
export { default as Panel } from './Panel.svelte';
export { default as Icon } from './Icon.svelte';

export { ICON_PATHS, type IconName } from './icons';
export {
  type Theme,
  type ThemePreference,
  THEME_PREFERENCES,
  THEME_LABELS,
  THEMES,
  isTheme,
  isHighContrast,
  isThemePreference,
  resolveTheme
} from './theme';
export {
  type LayoutState,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  PREVIEW_MIN,
  PREVIEW_MAX,
  BOTTOM_MIN,
  BOTTOM_MAX,
  DEFAULT_LAYOUT,
  clamp,
  setSidebarWidth,
  setPreviewWidth,
  setBottomPanelHeight,
  toggleSidebar,
  togglePreview,
  serializeLayout,
  parseLayout
} from './layout';
export { type Rgb, parseHex, relativeLuminance, contrastRatio } from './contrast';
