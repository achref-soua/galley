import { describe, it, expect } from 'vitest';
import { wrapInline, wrapDisplay } from '../src/lib/math.js';

describe('math helpers', () => {
  it('wrapInline surrounds with dollar signs', () => {
    expect(wrapInline('x^2')).toBe('$x^2$');
    expect(wrapInline('')).toBe('$$');
  });

  it('wrapDisplay surrounds with bracket notation', () => {
    expect(wrapDisplay('E = mc^2')).toBe('\\[\nE = mc^2\n\\]');
    expect(wrapDisplay('')).toBe('\\[\n\n\\]');
  });
});
