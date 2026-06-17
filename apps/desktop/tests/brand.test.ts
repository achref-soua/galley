import { describe, it, expect } from 'vitest';
import { NAME, TAGLINE, resolveTheme, windowTitle } from '../src/lib/brand';

describe('brand constants', () => {
  it('expose the product name and tagline', () => {
    expect(NAME).toBe('Galley');
    expect(TAGLINE).toBe('Pull a proof.');
  });
});

describe('resolveTheme', () => {
  it('follows the OS setting when the preference is "system"', () => {
    expect(resolveTheme('system', true)).toBe('carbon');
    expect(resolveTheme('system', false)).toBe('onionskin');
  });

  it('honours an explicit preference regardless of the OS setting', () => {
    expect(resolveTheme('onionskin', true)).toBe('onionskin');
    expect(resolveTheme('carbon', false)).toBe('carbon');
  });
});

describe('windowTitle', () => {
  it('combines the product name and a version', () => {
    expect(windowTitle('0.0.1')).toBe('Galley 0.0.1');
  });
});
