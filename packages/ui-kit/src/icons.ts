/** The icon glyphs the UI kit ships, as 24×24 stroke paths. */
export type IconName = 'panel-left' | 'panel-right' | 'settings' | 'close';

/** Path data for each icon, drawn with `fill: none; stroke: currentColor`. */
export const ICON_PATHS: Record<IconName, string> = {
  'panel-left': 'M3 4h18v16H3z M9 4v16',
  'panel-right': 'M3 4h18v16H3z M15 4v16',
  settings: 'M4 7h9 M17 7h3 M4 12h3 M11 12h9 M4 17h9 M17 17h3 M15 5v4 M9 10v4 M15 15v4',
  close: 'M6 6l12 12 M18 6L6 18'
};
