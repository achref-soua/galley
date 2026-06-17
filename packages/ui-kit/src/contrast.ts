/**
 * WCAG 2.x contrast helpers — pure, dependency-free.
 *
 * Used to keep the theme palette honest: the design-system tests assert the
 * real foreground/background pairings clear their target ratios in both themes.
 */

/** A parsed sRGB colour with 0–255 channels. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a `#rgb` or `#rrggbb` hex string into channels.
 * Throws on anything that is not a recognised hex colour.
 */
export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (match === null) {
    throw new Error(`not a hex colour: ${hex}`);
  }
  let body = match[1];
  if (body.length === 3) {
    body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
  }
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16)
  };
}

/** Linearise a single sRGB channel (0–255) per the WCAG formula. */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance (0–1) of a colour, per WCAG. */
export function relativeLuminance(color: Rgb | string): number {
  const { r, g, b } = typeof color === 'string' ? parseHex(color) : color;
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * Contrast ratio between two colours, from 1 (identical) to 21 (black/white).
 * Order-independent.
 */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
