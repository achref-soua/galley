import { describe, it, expect } from 'vitest';
import { parseHex, relativeLuminance, contrastRatio } from '../src/contrast';

describe('parseHex', () => {
  it('parses a six-digit hex', () => {
    expect(parseHex('#1c1a17')).toEqual({ r: 28, g: 26, b: 23 });
  });

  it('expands a three-digit hex', () => {
    expect(parseHex('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });

  it('trims surrounding whitespace', () => {
    expect(parseHex('  #ffffff  ')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('throws on a non-hex string', () => {
    expect(() => parseHex('rgb(1,2,3)')).toThrow(/not a hex colour/);
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('accepts a parsed Rgb value', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('is 1:1 for a colour against itself', () => {
    expect(contrastRatio('#a8362b', '#a8362b')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#1c1a17', '#ece3d0')).toBeCloseTo(contrastRatio('#ece3d0', '#1c1a17'), 5);
  });
});
